import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';

export async function GET() {
  try {
    const employee = await getEmployeeFromCookie();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未登录或登录已过期' },
        { status: 401 }
      );
    }

    if (!employee.examId) {
      return NextResponse.json(
        { success: false, error: '当前没有可参加的考试' },
        { status: 404 }
      );
    }

    const exam = await prisma.exam.findUnique({
      where: { id: employee.examId },
      include: {
        questionRules: {
          select: {
            id: true,
            questionType: true,
            count: true,
            pointsPerQuestion: true,
          },
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

    // Check if the exam is still open
    const now = new Date();
    if (exam.openAt && exam.openAt > now) {
      return NextResponse.json(
        { success: false, error: '考试尚未开始' },
        { status: 403 }
      );
    }
    if (exam.closeAt && exam.closeAt < now) {
      return NextResponse.json(
        { success: false, error: '考试已关闭' },
        { status: 403 }
      );
    }

    // Check if the employee has an existing in-progress session
    const existingSession = await prisma.examSession.findFirst({
      where: {
        examId: exam.id,
        userId: employee.userId,
        status: 'IN_PROGRESS',
      },
      select: { id: true, startedAt: true, attemptNumber: true },
    });

    // Check attempt count
    const attemptCount = exam._count.sessions;
    const canStart = attemptCount < exam.maxAttempts || !!existingSession;

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
