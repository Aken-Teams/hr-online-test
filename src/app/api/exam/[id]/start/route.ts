import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { generateQuestionSet } from '@/lib/question-generator';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromCookie();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未登录或登录已过期' },
        { status: 401 }
      );
    }

    const { id: examId } = await params;

    // Verify exam exists and is active
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!exam || !['PUBLISHED', 'ACTIVE'].includes(exam.status)) {
      return NextResponse.json(
        { success: false, error: '考试不存在或未开放' },
        { status: 404 }
      );
    }

    // Check time window
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

    // Check if there's already an in-progress session - resume it
    const existingSession = await prisma.examSession.findFirst({
      where: {
        examId,
        userId: employee.userId,
        status: 'IN_PROGRESS',
      },
      include: {
        answers: {
          select: {
            questionId: true,
            answerContent: true,
            isFlagged: true,
          },
        },
      },
    });

    if (existingSession) {
      // Resume: load only this session's questions (via questionOrder)
      const orderArray = existingSession.questionOrder as string[] | null;
      const questionIds = orderArray && Array.isArray(orderArray) ? orderArray : [];

      const examQuestions = await prisma.examQuestion.findMany({
        where: {
          examId,
          ...(questionIds.length > 0 ? { questionId: { in: questionIds } } : {}),
        },
        include: {
          question: {
            include: {
              options: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });

      // Sort according to questionOrder
      let orderedQuestions = examQuestions;
      if (questionIds.length > 0) {
        const orderMap = new Map(questionIds.map((id, idx) => [id, idx]));
        orderedQuestions = [...examQuestions].sort((a, b) => {
          const aIdx = orderMap.get(a.questionId) ?? a.sortOrder;
          const bIdx = orderMap.get(b.questionId) ?? b.sortOrder;
          return aIdx - bIdx;
        });
      }

      const questions = orderedQuestions.map((eq, idx) => ({
        id: eq.question.id,
        type: eq.question.type,
        content: eq.question.content,
        points: eq.points,
        isMultiSelect: eq.question.isMultiSelect,
        options: eq.question.options.map((o) => ({
          label: o.label,
          content: o.content,
          imageUrl: o.imageUrl ?? null,
        })),
        sortOrder: idx,
      }));

      // Calculate remaining time
      const startTime = existingSession.startedAt ?? now;
      const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const timeRemaining = Math.max(0, exam.timeLimitMinutes * 60 - elapsedSeconds);

      return NextResponse.json({
        success: true,
        data: {
          sessionId: existingSession.id,
          examId,
          startedAt: existingSession.startedAt,
          attemptNumber: existingSession.attemptNumber,
          questions,
          answers: existingSession.answers,
          timeRemaining,
          resumed: true,
        },
      });
    }

    // Check attempt limit
    const attemptCount = await prisma.examSession.count({
      where: { examId, userId: employee.userId },
    });

    if (attemptCount >= exam.maxAttempts) {
      return NextResponse.json(
        { success: false, error: `已达最大作答次数 (${exam.maxAttempts})` },
        { status: 403 }
      );
    }

    // Get employee info for question generation
    const user = await prisma.user.findUnique({
      where: { id: employee.userId },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: '员工信息不存在' },
        { status: 404 }
      );
    }

    // Generate question set
    const { questions: generatedQuestions, warnings } = await generateQuestionSet(
      examId,
      user.department,
      user.role
    );

    // Create ExamQuestion records + ExamSession in a transaction
    const questionOrder = generatedQuestions.map((q) => q.questionId);

    const session = await prisma.$transaction(async (tx) => {
      // Create ExamQuestion records (if not existing from previous attempts)
      for (const gq of generatedQuestions) {
        await tx.examQuestion.upsert({
          where: {
            examId_questionId: {
              examId,
              questionId: gq.questionId,
            },
          },
          create: {
            examId,
            questionId: gq.questionId,
            sortOrder: gq.sortOrder,
            points: gq.points,
          },
          update: {},
        });
      }

      // Create session
      const newSession = await tx.examSession.create({
        data: {
          examId,
          userId: employee.userId,
          status: 'IN_PROGRESS',
          attemptNumber: attemptCount + 1,
          startedAt: now,
          lastActiveAt: now,
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
          userAgent: request.headers.get('user-agent') || null,
          questionOrder,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          sessionId: newSession.id,
          action: 'SESSION_START',
          details: { examId, attemptNumber: attemptCount + 1 },
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
        },
      });

      return newSession;
    });

    // Fetch the full questions to return (without correct answers)
    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        examId,
        questionId: { in: questionOrder },
      },
      include: {
        question: {
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    // Sort according to questionOrder
    const orderMap = new Map(questionOrder.map((id, idx) => [id, idx]));
    const sortedEqs = [...examQuestions].sort((a, b) => {
      const aIdx = orderMap.get(a.questionId) ?? 0;
      const bIdx = orderMap.get(b.questionId) ?? 0;
      return aIdx - bIdx;
    });

    const questions = sortedEqs.map((eq, idx) => ({
      id: eq.question.id,
      type: eq.question.type,
      content: eq.question.content,
      points: eq.points,
      isMultiSelect: eq.question.isMultiSelect,
      options: eq.question.options.map((o) => ({
        label: o.label,
        content: o.content,
      })),
      sortOrder: idx,
    }));

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        examId,
        startedAt: session.startedAt,
        attemptNumber: session.attemptNumber,
        questions,
        answers: [],
        timeRemaining: exam.timeLimitMinutes * 60,
        resumed: false,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });
  } catch (error) {
    console.error('Start exam error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
