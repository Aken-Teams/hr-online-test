import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    // SSE endpoint streaming active exam sessions every 3 seconds
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;

        const closeOnce = () => {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
          }
        };

        let interval: ReturnType<typeof setInterval> | null = null;

        const sendEvent = async () => {
          if (closed) return;
          try {
            const sessionWhere: Record<string, unknown> = {};

            if (examId) {
              sessionWhere.examId = examId;
            } else {
              sessionWhere.status = 'IN_PROGRESS';
            }

            const sessions = await prisma.examSession.findMany({
              where: sessionWhere,
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    employeeNo: true,
                    department: true,
                  },
                },
                exam: {
                  select: {
                    id: true,
                    title: true,
                    timeLimitMinutes: true,
                    tabSwitchLimit: true,
                  },
                },
                _count: {
                  select: { answers: true },
                },
              },
              orderBy: { startedAt: 'desc' },
            });

            if (closed) return; // check again after async queries

            const data = sessions.map((s) => {
              // Use session's questionOrder for accurate per-session count
              const qOrder = s.questionOrder as string[] | null;
              const sessionTotalQuestions = qOrder && Array.isArray(qOrder) ? qOrder.length : 0;
              return {
              id: s.id,
              employeeName: s.user.name,
              employeeNo: s.user.employeeNo,
              department: s.user.department,
              answeredCount: s._count.answers,
              totalQuestions: sessionTotalQuestions,
              status: s.status,
              tabSwitchCount: s.tabSwitchCount,
              tabSwitchLimit: s.exam.tabSwitchLimit,
              lastActiveAt: s.lastActiveAt,
              startedAt: s.startedAt,
              timeLimitMinutes: s.exam.timeLimitMinutes,
            };
            });

            const event = `data: ${JSON.stringify({ type: 'sessions', sessions: data })}\n\n`;
            controller.enqueue(encoder.encode(event));
          } catch {
            // Controller closed or DB error — stop the stream
            if (interval) clearInterval(interval);
            closeOnce();
          }
        };

        // Send initial data immediately
        await sendEvent();

        // Stream every 3 seconds
        interval = setInterval(() => {
          sendEvent();
        }, 3000);

        // Clean up on close after 10 minutes max (server-side timeout)
        setTimeout(() => {
          if (interval) clearInterval(interval);
          closeOnce();
        }, 10 * 60 * 1000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Monitoring sessions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
