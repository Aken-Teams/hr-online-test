import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { isInExamTimeWindow } from '@/lib/exam-batch';
import type { MyExamItem } from '@/types/exam';

/**
 * GET /api/exam/my-exams
 * Returns all exam assignments for the current employee,
 * each with its session status and whether they can start.
 */
export async function GET() {
  try {
    const employee = await getEmployeeFromCookie();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未登录或登录已过期' },
        { status: 401 }
      );
    }

    const now = new Date();

    // Find all assignments for this user where exam is PUBLISHED/ACTIVE/CLOSED
    const assignments = await prisma.examAssignment.findMany({
      where: {
        OR: [
          { userId: employee.userId },
          {
            userId: null,
            department: employee.department,
          },
        ],
        exam: {
          status: { in: ['PUBLISHED', 'ACTIVE', 'CLOSED', 'ARCHIVED'] },
        },
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            description: true,
            timeLimitMinutes: true,
            totalScore: true,
            passScore: true,
            isPracticeMode: true,
            openAt: true,
            closeAt: true,
            status: true,
            maxAttempts: true,
            batches: {
              select: { id: true, name: true, openAt: true, closeAt: true },
              orderBy: { openAt: 'asc' as const },
            },
          },
        },
        sessions: {
          where: { userId: employee.userId },
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            attemptNumber: true,
          },
        },
      },
      orderBy: { exam: { createdAt: 'desc' } },
    });

    // Also query sessions directly by examId+userId to catch old sessions
    // that don't have assignmentId set (backward compatibility)
    const examIds = [...new Set(assignments.map((a) => a.exam.id))];
    const allSessions = examIds.length
      ? await prisma.examSession.findMany({
          where: {
            userId: employee.userId,
            examId: { in: examIds },
          },
          orderBy: { attemptNumber: 'desc' },
          select: {
            id: true,
            status: true,
            attemptNumber: true,
            examId: true,
            assignmentId: true,
            startedAt: true,
          },
        })
      : [];

    // Auto-close expired IN_PROGRESS sessions
    const examTimeLimits = new Map(assignments.map((a) => [a.exam.id, a.exam.timeLimitMinutes]));
    const expiredSessionIds: string[] = [];
    for (const s of allSessions) {
      if (s.status === 'IN_PROGRESS' && s.startedAt) {
        const limit = examTimeLimits.get(s.examId);
        if (limit) {
          const elapsed = Math.floor((now.getTime() - s.startedAt.getTime()) / 1000);
          if (elapsed >= limit * 60) {
            expiredSessionIds.push(s.id);
            s.status = 'COMPLETED'; // update in-memory for correct display
          }
        }
      }
    }
    // Also check assignment-level sessions
    for (const a of assignments) {
      const s = a.sessions[0];
      if (s?.status === 'IN_PROGRESS') {
        // Need startedAt — fetch it
        const limit = a.exam.timeLimitMinutes;
        const fullSession = await prisma.examSession.findUnique({
          where: { id: s.id },
          select: { startedAt: true },
        });
        if (fullSession?.startedAt) {
          const elapsed = Math.floor((now.getTime() - fullSession.startedAt.getTime()) / 1000);
          if (elapsed >= limit * 60) {
            if (!expiredSessionIds.includes(s.id)) {
              expiredSessionIds.push(s.id);
            }
            s.status = 'COMPLETED'; // update in-memory
          }
        }
      }
    }
    // Batch update expired sessions in DB
    if (expiredSessionIds.length > 0) {
      await prisma.examSession.updateMany({
        where: { id: { in: expiredSessionIds } },
        data: { status: 'COMPLETED', submittedAt: now },
      }).catch((e) => console.error('Auto-close expired sessions error:', e));
    }

    // Build a map: examId → latest session WITHOUT assignmentId (backward compat only)
    // Sessions WITH assignmentId should only match via the a.sessions relation
    const sessionsByExam = new Map<string, typeof allSessions[0]>();
    for (const s of allSessions) {
      if (!s.assignmentId && !sessionsByExam.has(s.examId)) {
        sessionsByExam.set(s.examId, s);
      }
    }

    const items: MyExamItem[] = assignments.map((a) => {
      const exam = a.exam;
      // Prefer session from the assignment relation; fall back to examId+userId match
      const session = a.sessions[0] || sessionsByExam.get(exam.id) || null;
      const windowResult = isInExamTimeWindow(exam, exam.batches, now);

      const attemptNumber = session?.attemptNumber ?? 0;
      const sessionStatus = session?.status ?? 'NOT_STARTED';
      const isCompleted = sessionStatus === 'SUBMITTED' || sessionStatus === 'COMPLETED' || sessionStatus === 'AUTO_SUBMITTED';
      const canStart =
        windowResult.inWindow &&
        exam.status !== 'CLOSED' &&
        exam.status !== 'ARCHIVED' &&
        (sessionStatus === 'IN_PROGRESS' || (!isCompleted && attemptNumber < exam.maxAttempts));

      return {
        examId: exam.id,
        assignmentId: a.id,
        title: exam.title,
        description: exam.description,
        process: a.process,
        level: a.level,
        timeLimitMinutes: exam.timeLimitMinutes,
        totalScore: exam.totalScore,
        passScore: exam.passScore,
        isPracticeMode: exam.isPracticeMode,
        openAt: exam.openAt?.toISOString() ?? null,
        closeAt: exam.closeAt?.toISOString() ?? null,
        examStatus: exam.status,
        sessionStatus: sessionStatus as MyExamItem['sessionStatus'],
        sessionId: session?.id ?? null,
        attemptNumber,
        canStart,
        batches: exam.batches.map((b) => ({
          id: b.id,
          name: b.name,
          openAt: b.openAt.toISOString(),
          closeAt: b.closeAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Get my-exams error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
