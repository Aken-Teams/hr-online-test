import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    // SSE endpoint streaming active exam sessions every 3 seconds
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = async () => {
          try {
            const sessions = await prisma.examSession.findMany({
              where: { status: 'IN_PROGRESS' },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    employeeNo: true,
                    department: true,
                    role: true,
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

            const data = sessions.map((s) => ({
              sessionId: s.id,
              examId: s.examId,
              examTitle: s.exam.title,
              userId: s.userId,
              employeeName: s.user.name,
              employeeNo: s.user.employeeNo,
              department: s.user.department,
              startedAt: s.startedAt,
              lastActiveAt: s.lastActiveAt,
              tabSwitchCount: s.tabSwitchCount,
              tabSwitchLimit: s.exam.tabSwitchLimit,
              timeLimitMinutes: s.exam.timeLimitMinutes,
              answeredCount: s._count.answers,
              attemptNumber: s.attemptNumber,
            }));

            const event = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(event));
          } catch (err) {
            console.error('SSE data fetch error:', err);
            const event = `data: ${JSON.stringify({ error: '数据获取失败' })}\n\n`;
            controller.enqueue(encoder.encode(event));
          }
        };

        // Send initial data immediately
        await sendEvent();

        // Stream every 3 seconds
        const interval = setInterval(async () => {
          try {
            await sendEvent();
          } catch {
            clearInterval(interval);
            controller.close();
          }
        }, 3000);

        // Clean up on close after 10 minutes max (server-side timeout)
        setTimeout(() => {
          clearInterval(interval);
          controller.close();
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
