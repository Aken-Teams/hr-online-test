import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';

export async function GET(
  _request: Request,
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

    const { id } = await params;

    // Find session — `id` can be either a sessionId or examId
    let session = await prisma.examSession.findFirst({
      where: {
        id,
        userId: employee.userId,
        status: { in: ['SUBMITTED', 'GRADING', 'COMPLETED', 'AUTO_SUBMITTED'] },
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        exam: {
          select: {
            showResultImmediately: true,
            showCorrectAnswers: true,
            title: true,
            totalScore: true,
            passScore: true,
          },
        },
        result: true,
      },
    });

    // Fallback: try treating `id` as examId
    if (!session) {
      session = await prisma.examSession.findFirst({
        where: {
          examId: id,
          userId: employee.userId,
          status: { in: ['SUBMITTED', 'GRADING', 'COMPLETED', 'AUTO_SUBMITTED'] },
        },
        orderBy: { submittedAt: 'desc' },
        include: {
          exam: {
            select: {
              showResultImmediately: true,
              showCorrectAnswers: true,
              title: true,
              totalScore: true,
              passScore: true,
            },
          },
          result: true,
        },
      });
    }

    if (!session) {
      return NextResponse.json(
        { success: false, error: '未找到已提交的考试记录' },
        { status: 404 }
      );
    }

    if (!session.exam.showResultImmediately && !session.result?.isFullyGraded) {
      return NextResponse.json({
        success: true,
        data: {
          sessionId: session.id,
          examTitle: session.exam.title,
          message: '考试结果正在批阅中，请等待管理员评分后查看。',
          status: session.status,
          submittedAt: session.submittedAt,
          isPending: true,
        },
      });
    }

    // Load answers with question details for wrong answer analysis
    const answers = await prisma.answer.findMany({
      where: { sessionId: session.id },
      include: {
        question: {
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    // Build wrong answer analysis (include correct answers if exam config allows)
    const wrongAnswers = answers
      .filter((a) => a.isCorrect === false)
      .map((a) => ({
        questionId: a.questionId,
        questionType: a.question.type,
        questionContent: a.question.content,
        yourAnswer: a.answerContent,
        correctAnswer: session.exam.showCorrectAnswers
          ? a.question.correctAnswer
          : null,
        earnedPoints: a.earnedPoints ?? 0,
        maxPoints: a.question.points,
        options: session.exam.showCorrectAnswers
          ? a.question.options.map((o) => ({
              label: o.label,
              content: o.content,
            }))
          : undefined,
      }));

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        examTitle: session.exam.title,
        status: session.status,
        submittedAt: session.submittedAt,
        isPending: false,
        result: session.result
          ? {
              totalScore: session.result.totalScore,
              autoScore: session.result.autoScore,
              manualScore: session.result.manualScore,
              maxPossibleScore: session.result.maxPossibleScore,
              correctCount: session.result.correctCount,
              totalQuestions: session.result.totalQuestions,
              timeTakenSeconds: session.result.timeTakenSeconds,
              isPassed: session.result.isPassed,
              gradeLabel: session.result.gradeLabel,
              categoryScores: session.result.categoryScores,
              isFullyGraded: session.result.isFullyGraded,
            }
          : null,
        wrongAnswers,
      },
    });
  } catch (error) {
    console.error('Get exam result error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
