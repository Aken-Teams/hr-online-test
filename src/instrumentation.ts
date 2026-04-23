/**
 * Next.js instrumentation — runs once when the server starts.
 * Used to start a background timer that auto-syncs exam statuses
 * based on openAt/closeAt times (every 60 seconds).
 */
export async function register() {
  // Only run on the server side (not during build or in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { syncExamStatuses } = await import('@/lib/exam-status-sync');

    // Run once immediately on startup
    syncExamStatuses().catch((err) =>
      console.error('[exam-status-sync] initial sync error:', err)
    );

    // Then run every 60 seconds
    setInterval(() => {
      syncExamStatuses().catch((err) =>
        console.error('[exam-status-sync] periodic sync error:', err)
      );
    }, 60_000);

    console.log('[exam-status-sync] background timer started (every 60s)');
  }
}
