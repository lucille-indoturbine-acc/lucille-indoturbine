'use client';

import { useEffect } from 'react';

/**
 * Root error boundary — catches server component errors that would otherwise
 * close the RSC stream with just "Connection closed" in the browser console.
 * Shows the actual error message so we can diagnose production issues.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || 'An unexpected error occurred.'}
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
