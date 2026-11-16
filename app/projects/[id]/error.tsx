'use client';

import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

/**
 * Error boundary for the project detail page.
 *
 * Without this, a thrown server component shows "Connection closed" in the
 * browser console and leaves the loading skeleton permanently visible — no
 * error message, no retry button, no way to know what failed.
 *
 * With it, the actual error message is shown, which is what lets us diagnose
 * failing Postgres queries in production.
 */
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ProjectError]', error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Link
        href="/projects"
        className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All projects
      </Link>
      <h1 className="text-xl font-semibold">Project failed to load</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || 'An unexpected error occurred while loading this project.'}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground/60">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
