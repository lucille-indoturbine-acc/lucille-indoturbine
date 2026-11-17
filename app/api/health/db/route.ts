/**
 * What the deployed instance actually has.
 *
 * GET /api/health/db
 */
import { connection } from 'next/server';
import { NextResponse } from 'next/server';

import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/pg';
import * as schema from '@/lib/schema';

/** Per-instance, so two calls landing on two lambdas are distinguishable. */
const INSTANCE = Math.random().toString(36).slice(2, 8);
const BOOTED = Date.now();

export async function GET() {
  await connection();

  let projects:
    | {
        count: number;
        ids: string[];
        rows: { id: string; basis: string; leaves: number; unweighted: number }[];
      }
    | { error: string };
  // Extended diagnostics: test which queries hang or fail.
  const diag: Record<string, string | number> = {};

  async function timed<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    const t0 = Date.now();
    try {
      const r = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      diag[key] = Date.now() - t0;
      return r;
    } catch (e) {
      diag[key] = `ERR(${Date.now() - t0}ms): ${(e as Error).message}`;
      return null;
    }
  }

  try {
    const rows = await db
      .select({ id: schema.projects.id, basis: schema.projects.weightBasis })
      .from(schema.projects);
    await timed('projects_full', () =>
      db.select().from(schema.projects).limit(5)
    );
    const nodes = await timed('wbs_full', () =>
      db.select().from(schema.wbsNodes).limit(5)
    );
    await timed('weeks_full', () =>
      db.select().from(schema.weeks).limit(5)
    );
    await timed('leaf_progress_full', () =>
      db.select().from(schema.leafProgress).limit(5)
    );
    await timed('baselines', () =>
      db.select().from(schema.baselines).limit(5)
    );
    await timed('node_schedules', () =>
      db.select().from(schema.nodeSchedules).limit(5)
    );
    // Column existence check — catches missing columns without crashing
    await timed('columns_wbs', () =>
      db.execute(
        sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'wbs_nodes' ORDER BY ordinal_position`
      )
    );
    await timed('columns_projects', () =>
      db.execute(
        sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' ORDER BY ordinal_position`
      )
    );

    // ---- targeted tests: exact queries the project page runs ----
    // These run sequentially so we know WHICH query fails, not just that something did.
    if (rows.length > 0) {
      const pid = rows[0].id;
      await timed('p_wbs_by_project', () =>
        db.select().from(schema.wbsNodes).where(eq(schema.wbsNodes.projectId, pid))
      );
      await timed('p_baselines_by_project', () =>
        db.select().from(schema.baselines).where(eq(schema.baselines.projectId, pid))
      );
      await timed('p_weeks_by_project', () =>
        db.select().from(schema.weeks).where(eq(schema.weeks.projectId, pid))
      );
      await timed('p_milestones_join', () =>
        db.select({
          id: schema.milestones.id,
          nodeId: schema.milestones.nodeId,
          label: schema.milestones.label,
          weight: schema.milestones.weight,
          order: schema.milestones.order,
        })
          .from(schema.milestones)
          .innerJoin(schema.wbsNodes, eq(schema.wbsNodes.id, schema.milestones.nodeId))
          .where(eq(schema.wbsNodes.projectId, pid))
      );
      await timed('p_node_schedules_join_sql', () =>
        db.execute(
          sql`select count(distinct s.node_id) as n from node_schedules s join wbs_nodes n on n.id = s.node_id where n.project_id = ${pid}`
        )
      );
      await timed('p_leaf_progress_in', async () => {
        const wkRows = await db.select({ id: schema.weeks.id }).from(schema.weeks).where(eq(schema.weeks.projectId, pid));
        const ids = wkRows.map((r) => r.id);
        if (!ids.length) return [];
        return db.select().from(schema.leafProgress).where(inArray(schema.leafProgress.weekId, ids));
      });
      // Concurrent: simulates what the project page does (many queries at once)
      await timed('p_concurrent_all', () =>
        Promise.all([
          db.select().from(schema.projects).where(eq(schema.projects.id, pid)),
          db.select().from(schema.wbsNodes).where(eq(schema.wbsNodes.projectId, pid)),
          db.select().from(schema.weeks).where(eq(schema.weeks.projectId, pid)),
          db.select().from(schema.baselines).where(eq(schema.baselines.projectId, pid)),
          db.execute(sql`select count(distinct s.node_id) as n from node_schedules s join wbs_nodes n on n.id = s.node_id where n.project_id = ${pid}`),
          db.select({
            id: schema.milestones.id,
            nodeId: schema.milestones.nodeId,
            label: schema.milestones.label,
            weight: schema.milestones.weight,
            order: schema.milestones.order,
          })
            .from(schema.milestones)
            .innerJoin(schema.wbsNodes, eq(schema.wbsNodes.id, schema.milestones.nodeId))
            .where(eq(schema.wbsNodes.projectId, pid)),
        ])
      );
    }

    projects = {
      count: rows.length,
      ids: rows.map((r) => r.id),
      rows: rows.map((r) => {
        const mine = (nodes ?? []).filter((n) => n.projectId === r.id && n.isLeaf);
        return {
          id: r.id,
          basis: r.basis,
          leaves: mine.length,
          unweighted: mine.filter((n) => !n.bobot).length,
        };
      }),
    };
  } catch (err) {
    projects = { error: (err as Error).message };
  }

  return NextResponse.json(
    {
      instance: INSTANCE,
      upMs: Date.now() - BOOTED,
      region: process.env.VERCEL_REGION ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      dbBackend: 'supabase-postgres',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]
        : null,
      diag,
      projects,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
