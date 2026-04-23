import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { syncExamStatuses } from '@/lib/exam-status-sync';
import { isInExamTimeWindow } from '@/lib/exam-batch';

/**
 * GET /api/exam/available?assignmentId=xxx
 *
 * New flow: look up exam via assignmentId.
 * Legacy flow: fall back to employee.examId if no assignmentId.
 */
export async function GET(request: Request) {
  try {
    const employee = await getEmployeeFromCookie();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未登录或登录已过期' },
        { status: 401 }
      );
    }

    // Auto-sync exam statuses based on openAt/closeAt
    await syncExamStatuses();

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');

    let examId: string | null = null;
    let assignmentProcess: string | null = null;
    let assignmentLevel: string | null = null;

    if (assignmentId) {
      // New flow: look up assignment → get examId
      const assignment = await prisma.examAssignment.findUnique({
        where: { id: assignmentId },
        select: { examId: true, userId: true, process: true, level: true },
      });

      if (!assignment) {
        return NextResponse.json(
          { success: false, error: '考试指派不存在' },
          { status: 404 }
        );
      }

      // Verify the assignment belongs to this user
      if (assignment.userId && assignment.userId !== employee.userId) {
        return NextResponse.json(
          { success: false, error: '无权限访问此考试' },
          { status: 403 }
        );
      }

      examId = assignment.examId;
      assignmentProcess = assignment.process;
      assignmentLevel = assignment.level;
    } else if (employee.examId) {
      // Legacy flow: examId from JWT (backwards compatibility)
      examId = employee.examId;
    } else {
      // Try to find any assignment for this user with an active exam
      const assignment = await prisma.examAssignment.findFirst({
        where: {
          userId: employee.userId,
          exam: { status: { in: ['PUBLISHED', 'ACTIVE'] } },
        },
        include: { exam: { select: { id: true } } },
        orderBy: { exam: { createdAt: 'desc' } },
      });

      if (!assignment) {
        return NextResponse.json(
          { success: false, error: '当前没有可参加的考试' },
          { status: 404 }
        );
      }

      examId = assignment.examId;
      assignmentProcess = assignment.process;
      assignmentLevel = assignment.level;
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questionRules: {
          select: {
            id: true,
            questionType: true,
            count: true,
            pointsPerQuestion: true,
          },
        },
        batches: {
          select: { id: true, name: true, openAt: true, closeAt: true },
          orderBy: { openAt: 'asc' },
        },
        _count: {
          select: {
            sessions: {
              where: { userId: employee.userId },
            },
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    // Check time window (batch-aware)
    const now = new Date();
    const windowResult = isInExamTimeWindow(exam, exam.batches, now);
    const isBeforeOpen = exam.openAt && exam.openAt > now;
    const isAfterClose = exam.closeAt && exam.closeAt < now;

    if (isBeforeOpen && !windowResult.inWindow) {
      return NextResponse.json(
        { success: false, error: '考试尚未开始' },
        { status: 403 }
      );
    }

    // Check existing in-progress session (scoped to assignment if available)
    const sessionWhere: Record<string, unknown> = {
      examId: exam.id,
      userId: employee.userId,
      status: 'IN_PROGRESS',
    };
    if (assignmentId) {
      sessionWhere.assignmentId = assignmentId;
    }

    const existingSession = await prisma.examSession.findFirst({
      where: sessionWhere,
      select: { id: true, startedAt: true, attemptNumber: true },
    });

    const attemptCount = exam._count.sessions;

    if (isAfterClose && windowResult.allBatchesEnded !== false) {
      if (attemptCount === 0) {
        return NextResponse.json(
          { success: false, error: '考试已关闭' },
          { status: 403 }
        );
      }
    }

    // canStart: must be in a time window (batch or exam-level) and have attempts remaining
    const canStart = windowResult.inWindow && (attemptCount < exam.maxAttempts || !!existingSession);

    return NextResponse.json({
      success: true,
      data: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        timeLimitMinutes: exam.timeLimitMinutes,
        passScore: exam.passScore,
        totalScore: exam.totalScore,
        isPracticeMode: exam.isPracticeMode,
        shuffleQuestions: exam.shuffleQuestions,
        tabSwitchLimit: exam.tabSwitchLimit,
        enableFaceAuth: exam.enableFaceAuth,
        maxAttempts: exam.maxAttempts,
        openAt: exam.openAt,
        closeAt: exam.closeAt,
        questionRules: exam.questionRules,
        attemptCount,
        canStart,
        assignmentProcess,
        assignmentLevel,
        batches: exam.batches.map((b) => ({
          id: b.id,
          name: b.name,
          openAt: b.openAt.toISOString(),
          closeAt: b.closeAt.toISOString(),
        })),
        currentBatch: windowResult.currentBatch ?? null,
        nextBatch: windowResult.nextBatch
          ? { ...windowResult.nextBatch, openAt: windowResult.nextBatch.openAt.toISOString() }
          : null,
        existingSession: existingSession
          ? {
              id: existingSession.id,
              startedAt: existingSession.startedAt,
              attemptNumber: existingSession.attemptNumber,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Get available exam error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
