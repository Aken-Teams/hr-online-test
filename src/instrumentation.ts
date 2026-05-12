/**
 * Next.js instrumentation — runs once when the server starts.
 * Used to start background timers (every 60 seconds):
 *  1. Auto-sync exam statuses based on openAt/closeAt times
 *  2. Auto-submit expired IN_PROGRESS sessions (time expired or tab switch limit exceeded)
 */
export async function register() {
  // Only run on the server side (not during build or in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { syncExamStatuses } = await import('@/lib/exam-status-sync');
    const { autoSubmitExpiredSessions } = await import('@/lib/auto-submit-expired');

    // Run once immediately on startup
    syncExamStatuses().catch((err) =>
      console.error('[exam-status-sync] initial sync error:', err)
    );
    autoSubmitExpiredSessions().catch((err) =>
      console.error('[auto-submit] initial run error:', err)
    );

    // Then run every 60 seconds
    setInterval(() => {
      syncExamStatuses().catch((err) =>
        console.error('[exam-status-sync] periodic sync error:', err)
      );
      autoSubmitExpiredSessions().catch((err) =>
        console.error('[auto-submit] periodic run error:', err)
      );
    }, 60_000);

    console.log('[instrumentation] background timers started (every 60s)');
  }
}
