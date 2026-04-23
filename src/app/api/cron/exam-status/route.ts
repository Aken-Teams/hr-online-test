import { NextResponse } from 'next/server';
import { syncExamStatuses } from '@/lib/exam-status-sync';

/**
 * Cron endpoint to auto-transition exam statuses based on openAt/closeAt.
 *
 * Can be triggered by:
 * - Vercel Cron (configured in vercel.json)
 * - External scheduler (e.g. cron-job.org) hitting GET /api/cron/exam-status
 *
 * Secured via CRON_SECRET header or Vercel's built-in cron auth.
 */
export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow Vercel cron (no auth needed, Vercel handles it) or validate secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const result = await syncExamStatuses();

  return NextResponse.json({
    success: true,
    data: result,
  });
}
