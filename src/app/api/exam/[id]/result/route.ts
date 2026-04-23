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
            resultQueryOpenAt: true,
            resultQueryCloseAt: true,
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
              resultQueryOpenAt: true,
              resultQueryCloseAt: true,
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

    // When not showResultImmediately and not fully graded, still return
    // partial result (auto-graded objective scores) so employee can see
    // their objective score with a clear "pending" indicator for subjective parts.
    const isPendingGrading = !session.result?.isFullyGraded;

    // --- Result query time window check ---
    // Determines whether detailed results (wrong answers, correct answers) are visible.
    // Basic score info (autoScore, correct count, time) is always returned.
    const now = new Date();
    const { resultQueryOpenAt, resultQueryCloseAt } = session.exam;
    let isResultQueryOpen = false; // default: closed until admin explicitly opens
    if (resultQueryOpenAt) {
      // Admin has set an open time — check if we're within the window
      isResultQueryOpen = now >= new Date(resultQueryOpenAt);
      if (resultQueryCloseAt && now > new Date(resultQueryCloseAt)) {
        isResultQueryOpen = false;
      }
    }

    // Show correct answers whenever the result query window is open
    const effectiveShowCorrectAnswers = isResultQueryOpen;

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
    const actualTotalQuestions = examQuestions.length;

    // Questions that have no Answer record at all (legacy blank submissions)
    const missingQuestions = examQuestions.filter(
      (eq) => !answeredQuestionIds.has(eq.questionId)
    );

    // Count unanswered questions (answered blank + no answer record at all)
    const unansweredCount =
      answers.filter((a) => a.answerContent == null || a.answerContent.trim() === '').length
      + missingQuestions.length;

    // Count questions pending manual grading
    const pendingGradingCount = answers.filter(
      (a) => a.earnedPoints == null && ['SHORT_ANSWER', 'FILL_BLANK', 'CASE_ANALYSIS', 'PRACTICAL'].includes(a.question.type)
    ).length;

    // Build all question details — only when result query is open
    const allQuestions = !isResultQueryOpen ? [] : [
      ...answers.map((a) => ({
        questionId: a.questionId,
        questionType: a.question.type,
        questionContent: a.question.content,
        yourAnswer: a.answerContent,
        correctAnswer: effectiveShowCorrectAnswers
          ? a.question.correctAnswer
          : null,
        earnedPoints: a.earnedPoints ?? 0,
        maxPoints: a.question.points,
        isCorrect: a.isCorrect,
        // Always include options so the student can see what they chose
        options: a.question.options.map((o) => ({
          label: o.label,
          content: o.content,
          imageUrl: o.imageUrl ?? null,
        })),
      })),
      // Also add questions with NO answer record (legacy data)
      ...missingQuestions.map((eq) => ({
        questionId: eq.questionId,
        questionType: eq.question.type,
        questionContent: eq.question.content,
        yourAnswer: null as string | null,
        correctAnswer: effectiveShowCorrectAnswers
          ? eq.question.correctAnswer
          : null,
        earnedPoints: 0,
        maxPoints: eq.points,
        isCorrect: false as boolean | null,
        options: eq.question.options.map((o) => ({
          label: o.label,
          content: o.content,
          imageUrl: o.imageUrl ?? null,
        })),
      })),
    ];

    // Wrong answers subset (for backward compat)
    const wrongAnswers = allQuestions.filter(
      (q) => q.isCorrect === false || (q.isCorrect == null && q.earnedPoints === 0)
    );

    // --- Ranking & exam-wide stats ---
    const allResults = await prisma.examResult.findMany({
      where: {
        session: { examId: session.examId },
      },
      select: {
        totalScore: true,
        autoScore: true,
        timeTakenSeconds: true,
      },
      orderBy: [
        { totalScore: 'desc' },
        { autoScore: 'desc' },
        { timeTakenSeconds: 'asc' },
      ],
    });

    const myScore = session.result?.totalScore ?? session.result?.autoScore ?? 0;
    const myTime = session.result?.timeTakenSeconds ?? 0;

    // Calculate rank (higher score wins; on tie, shorter time wins)
    let rank = 1;
    for (const r of allResults) {
      const rScore = r.totalScore ?? r.autoScore;
      if (rScore > myScore || (rScore === myScore && r.timeTakenSeconds < myTime)) {
        rank++;
      }
    }

    const scores = allResults.map((r) => r.totalScore ?? r.autoScore);
    const totalParticipants = allResults.length;
    const averageScore = totalParticipants > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / totalParticipants) * 10) / 10
      : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        examTitle: session.exam.title,
        status: session.status,
        submittedAt: session.submittedAt,
        passScore: session.exam.passScore,
        isPending: false,
        isPendingGrading,
        isResultQueryOpen,
        resultQueryOpenAt: resultQueryOpenAt?.toISOString() ?? null,
        resultQueryCloseAt: resultQueryCloseAt?.toISOString() ?? null,
        result: session.result
          ? {
              totalScore: session.result.totalScore,
              autoScore: session.result.autoScore,
              manualScore: session.result.manualScore,
              maxPossibleScore: session.result.maxPossibleScore,
              correctCount: session.result.correctCount,
              // Use actual exam question count if stored value is stale (legacy data)
              totalQuestions: actualTotalQuestions > 0 ? actualTotalQuestions : session.result.totalQuestions,
              timeTakenSeconds: session.result.timeTakenSeconds,
              isPassed: session.result.isPassed,
              gradeLabel: session.result.gradeLabel,
              categoryScores: session.result.categoryScores,
              isFullyGraded: session.result.isFullyGraded,
              // Offline scores (only visible when result query is open)
              essayScore: isResultQueryOpen ? session.result.essayScore : null,
              practicalScore: isResultQueryOpen ? session.result.practicalScore : null,
              combinedScore: isResultQueryOpen ? session.result.combinedScore : null,
            }
          : null,
        ranking: {
          rank,
          totalParticipants,
          averageScore,
          highestScore,
        },
        unansweredCount,
        pendingGradingCount,
        wrongAnswers,
        allQuestions,
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
