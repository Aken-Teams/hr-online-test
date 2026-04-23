import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
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
          status: { in: ['PUBLISHED', 'ACTIVE', 'CLOSED'] },
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
          },
        })
      : [];

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
      const isBeforeOpen = exam.openAt ? exam.openAt > now : false;
      const isAfterClose = exam.closeAt ? exam.closeAt < now : false;
      const isInTimeWindow = !isBeforeOpen && !isAfterClose;

      const attemptNumber = session?.attemptNumber ?? 0;
      const sessionStatus = session?.status ?? 'NOT_STARTED';
      const isCompleted = sessionStatus === 'SUBMITTED' || sessionStatus === 'COMPLETED' || sessionStatus === 'AUTO_SUBMITTED';
      const canStart =
        isInTimeWindow &&
        exam.status !== 'CLOSED' &&
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
