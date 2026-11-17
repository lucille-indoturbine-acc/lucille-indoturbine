import { Suspense } from 'react';
import { connection } from 'next/server';

import { RouteTransition } from '@/components/motion/RouteTransition';
import SectionSkeleton from '@/components/ui/SectionSkeleton';
import { weekAndDay, weekRangeLabel } from '@/lib/daily-week';
import { weekOfDate } from '@/lib/weeks';
import { getOpenJsonDb, getOpenWeekGrid } from '@/lib/data';
import DailyReportsView from '@/components/daily/DailyReportsView';

function nextDateAfter(lastDate: string): string {
  const d = new Date(`${lastDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * EVERY PROJECT KEEPS ITS OWN DAYS.
 *
 * This page used to stand behind `LegacyGate`, which told every project but
 * the imported one that it had no daily reports "yet" — a yet with no way out,
 * because the only record the store would hand anybody was the imported
 * project's. A daily report is a form filled in from the site, not something
 * derived from a plan: there is no reason a project has to be imported before
 * it can have one. `getOpenJsonDb()` gives each project a record of its own
 * (see lib/legacy-bridge.ts), so the gate has nothing left to refuse.
 *
 * Behind `<Suspense>` because the open project is a cookie, and this page's
 * static HTML used to carry the open project's NAME to whoever the CDN served
 * it to next.
 */
export default function DailyListPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <DailyListBody />
    </Suspense>
  );
}

async function DailyListBody() {
  // connection() is the explicit request-data marker that cacheComponents
  // requires before any new Date() call. getActiveProjectId() skips cookies()
  // during `next build` (NEXT_PHASE check), so without this the clock reads at
  // lines ~60 and ~68 fail: "used new Date() before accessing uncached data".
  await connection();
  const db = await getOpenJsonDb();
  // After the connection() + cookie read above, the clock is allowed.
  const grid = await getOpenWeekGrid();
  const sorted = [...db.daily].sort((a, b) => b.date.localeCompare(a.date));
  // The days are grouped by the week they fall in ("Week 40, 28 Sep to 4 Oct"). Nobody
  // types the day of the project either: both come from the plan's dates.
  const anchor = grid?.anchorEnd ?? '';
  const rows = sorted.map((d) => {
    const wd = anchor ? weekAndDay(anchor, d.date) : null;
    return {
      date: d.date,
      hariKe: d.hariKe,
      week: wd?.week ?? null,
      day: wd?.day ?? null,
    };
  });
  // The filter offers EVERY week of the plan, start to finish (and any later week a
  // report was written for), newest first. The project's dates already say how many
  // weeks there are; stopping at this week hid weeks 41 to 72 of a 72-week plan.
  const todayWeek = anchor ? weekOfDate(anchor, new Date().toISOString().slice(0, 10)) : 0;
  const reportWeeks = rows.flatMap((r) => (r.week !== null ? [r.week] : []));
  const lastWeek = Math.max(grid?.lastWeek ?? 0, ...reportWeeks, 0);
  const weekLabels: Record<number, string> = {};
  for (let w = lastWeek; w >= 1; w--) weekLabels[w] = weekRangeLabel(anchor, w);
  // new Date() is after getOpenJsonDb() (a cookie read) — allowed by cacheComponents.
  const defaultDate = sorted[0]?.date
    ? nextDateAfter(sorted[0].date)
    : new Date().toISOString().slice(0, 10);

  // No entrance on the wrapper at all: the RouteTransition fades this whole
  // block on a navigation and the list rows do their own staggered rise, so a
  // translate here would be a third animation on top of two.
  return (
    <RouteTransition id="daily">
    <div className="p-4 sm:p-6 lg:p-8">
      <DailyReportsView
        reports={rows}
        weekLabels={weekLabels}
        thisWeek={todayWeek}
        defaultDate={defaultDate}
      />
    </div>
    </RouteTransition>
  );
}
