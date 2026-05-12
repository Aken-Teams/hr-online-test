import { NextResponse } from 'next/server';
import { autoSubmitExpiredSessions } from '@/lib/auto-submit-expired';

/**
 * Cron endpoint to auto-submit expired IN_PROGRESS sessions.
 *
 * Handles:
 * - Time-expired sessions (startedAt + timeLimitMinutes has passed)
 * - Tab switch limit exceeded sessions
 *
 * Can be triggered by:
 * - Vercel Cron (configured in vercel.json)
 * - External scheduler (e.g. cron-job.org) hitting GET /api/cron/auto-submit
 *
 * Secured via CRON_SECRET header or Vercel's built-in cron auth.
 */
export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const result = await autoSubmitExpiredSessions();

  return NextResponse.json({
    success: true,
    data: result,
  });
}
