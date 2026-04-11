import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { sessionId } = await params;

    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: {
          select: {
            title: true,
            totalScore: true,
            passScore: true,
            showCorrectAnswers: true,
          },
        },
        user: {
          select: {
            name: true,
            employeeNo: true,
            department: true,
          },
        },
        result: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: '未找到该考试会话' },
        { status: 404 }
      );
    }

    // Load answers with question details
    const answers = await prisma.answer.findMany({
      where: { sessionId },
      include: {
        question: {
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    // Load this session's exam questions (scoped by questionOrder)
    const questionOrder = session.questionOrder as string[] | null;
    const sessionQuestionIds = questionOrder && Array.isArray(questionOrder) ? questionOrder : [];

    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        examId: session.examId,
        ...(sessionQuestionIds.length > 0 ? { questionId: { in: sessionQuestionIds } } : {}),
      },
      include: {
        question: {
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const answeredQuestionIds = new Set(answers.map((a) => a.questionId));
    const totalQuestions = examQuestions.length;

    // Questions with no Answer record (legacy)
    const missingQuestions = examQuestions.filter(
      (eq) => !answeredQuestionIds.has(eq.questionId)
    );

    // Unanswered count
    const unansweredCount =
      answers.filter((a) => a.answerContent == null || a.answerContent.trim() === '').length
      + missingQuestions.length;

    // Pending grading count
    const pendingGradingCount = answers.filter(
      (a) => a.earnedPoints == null && ['SHORT_ANSWER', 'FILL_BLANK', 'CASE_ANALYSIS', 'PRACTICAL'].includes(a.question.type)
    ).length;

    // Build all question details (admin always sees correct answers)
    const questionDetails = [
      ...answers.map((a) => ({
        questionId: a.questionId,
        questionType: a.question.type,
        questionContent: a.question.content,
        yourAnswer: a.answerContent,
        correctAnswer: a.question.correctAnswer,
        earnedPoints: a.earnedPoints ?? 0,
        maxPoints: a.question.points,
        isCorrect: a.isCorrect,
        options: a.question.options.map((o) => ({
          label: o.label,
          content: o.content,
        })),
      })),
      ...missingQuestions.map((eq) => ({
        questionId: eq.questionId,
        questionType: eq.question.type,
        questionContent: eq.question.content,
        yourAnswer: null as string | null,
        correctAnswer: eq.question.correctAnswer,
        earnedPoints: 0,
        maxPoints: eq.points,
        isCorrect: false as boolean | null,
        options: eq.question.options.map((o) => ({
          label: o.label,
          content: o.content,
        })),
      })),
    ];

    // Separate into correct, wrong, unanswered
    const wrongAnswers = questionDetails.filter(
      (q) => q.isCorrect === false || (q.isCorrect == null && q.earnedPoints === 0)
    );
    const correctAnswers = questionDetails.filter((q) => q.isCorrect === true);

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        examTitle: session.exam.title,
        status: session.status,
        submittedAt: session.submittedAt,
        employee: {
          name: session.user.name,
          employeeNo: session.user.employeeNo,
          department: session.user.department,
        },
        result: session.result
          ? {
              totalScore: session.result.totalScore,
              autoScore: session.result.autoScore,
              manualScore: session.result.manualScore,
              maxPossibleScore: session.result.maxPossibleScore,
              correctCount: session.result.correctCount,
              totalQuestions: totalQuestions > 0 ? totalQuestions : session.result.totalQuestions,
              timeTakenSeconds: session.result.timeTakenSeconds,
              isPassed: session.result.isPassed,
              gradeLabel: session.result.gradeLabel,
              categoryScores: session.result.categoryScores,
              isFullyGraded: session.result.isFullyGraded,
            }
          : null,
        passScore: session.exam.passScore,
        unansweredCount,
        pendingGradingCount,
        correctAnswers,
        wrongAnswers,
        allQuestions: questionDetails,
      },
    });
  } catch (error) {
    console.error('Admin get session detail error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
