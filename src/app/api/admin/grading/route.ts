import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { batchGradingSchema, gradingSchema } from '@/lib/validators';
import { MANUAL_GRADE_TYPES } from '@/lib/constants';
import { getAdminScope, buildSessionScopeFilter, canAccessSession } from '@/lib/admin-scope';

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

    // 工序權限隔離（PRD F2-3）：評卷人僅能看到所負責工序考生的試卷
    const scope = await getAdminScope(admin);
    const scopeFilter = buildSessionScopeFilter(scope);

    const sessionWhere: Record<string, unknown> = {
      status: { in: ['SUBMITTED', 'GRADING', 'AUTO_SUBMITTED', 'COMPLETED'] },
      ...scopeFilter,
    };
    if (examId) {
      sessionWhere.examId = examId;
    }

    // Get all manual-grading answers for matching sessions
    const allManualAnswers = await prisma.answer.findMany({
      where: {
        question: {
          type: { in: MANUAL_GRADE_TYPES },
        },
        session: sessionWhere,
      },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            points: true,
            referenceAnswer: true,
            gradingRubric: true,
          },
        },
        session: {
          select: {
            id: true,
            examId: true,
            assignment: { select: { process: true, level: true } },
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
              },
            },
          },
        },
      },
      orderBy: { answeredAt: 'asc' },
    });

    // Get exam title
    let examTitle = '';
    if (examId) {
      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        select: { title: true },
      });
      examTitle = exam?.title ?? '';
    }

    // Per-exam point overrides: the exam's question rule decides the points for
    // this paper (e.g. a 10-point essay drawn from a 2-point question bank).
    const examQuestionPairs = allManualAnswers.map((a) => ({
      examId: a.session.examId,
      questionId: a.questionId,
    }));
    const examQuestions = examQuestionPairs.length
      ? await prisma.examQuestion.findMany({
          where: { OR: examQuestionPairs },
          select: { examId: true, questionId: true, points: true },
        })
      : [];
    const pointsMap = new Map(
      examQuestions.map((eq) => [`${eq.examId}:${eq.questionId}`, eq.points])
    );
    const maxPointsOf = (a: typeof allManualAnswers[number]) =>
      pointsMap.get(`${a.session.examId}:${a.questionId}`) ?? a.question.points;

    // Split into pending and graded
    const pendingAnswers = allManualAnswers.filter((a) => a.earnedPoints === null);
    const gradedAnswers = allManualAnswers.filter((a) => a.earnedPoints !== null);

    // Map ALL answers (pending first, then graded) for the frontend
    const mapAnswer = (a: typeof allManualAnswers[number]) => ({
      answerId: a.id,
      sessionId: a.sessionId,
      employeeName: a.session.user.name,
      department: a.session.user.department ?? '',
      process: a.session.assignment?.process ?? a.session.user.role ?? '',
      level: a.session.assignment?.level ?? '',
      questionContent: a.question.content,
      questionType: a.question.type,
      maxPoints: maxPointsOf(a),
      answerContent: a.answerContent,
      earnedPoints: a.earnedPoints,
      graderComment: a.graderComment,
      isGraded: a.earnedPoints != null,
      referenceAnswer: a.question.referenceAnswer,
      gradingRubric: a.question.gradingRubric,
      // AI 初評（僅供參考，未經評卷人確認不計入成績）
      aiScore: a.aiScore,
      aiReason: a.aiReason,
      aiKeyPoints: a.aiKeyPoints,
      aiConfidence: a.aiConfidence,
      aiModel: a.aiModel,
      scoreSource: a.scoreSource,
    });

    // Pending answers first, then graded ones
    const answers = [
      ...pendingAnswers.map(mapAnswer),
      ...gradedAnswers.map(mapAnswer),
    ];

    // 各工序閱卷進度（PRD F2-6）
    const progressMap = new Map<
      string,
      { process: string; pending: number; graded: number; aiSuggested: number }
    >();
    for (const a of allManualAnswers) {
      const process = a.session.assignment?.process ?? a.session.user.role ?? '未分配';
      if (!progressMap.has(process)) {
        progressMap.set(process, { process, pending: 0, graded: 0, aiSuggested: 0 });
      }
      const row = progressMap.get(process)!;
      if (a.earnedPoints === null) {
        row.pending += 1;
        if (a.aiScore !== null) row.aiSuggested += 1;
      } else {
        row.graded += 1;
      }
    }
    const byProcess = [...progressMap.values()].sort((a, b) => {
      if (b.pending !== a.pending) return b.pending - a.pending;
      return a.process.localeCompare(b.process, 'zh-Hant');
    });

    return NextResponse.json({
      success: true,
      data: {
        examTitle,
        totalPending: pendingAnswers.length,
        gradedCount: gradedAnswers.length,
        answers,
        byProcess,
        // 評卷人僅見所負責工序；null 代表不受限（系統管理員／人資）
        scopedProcesses: scope.processes,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('List pending grading error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    // 仅评卷人可评分；管理员 / 人资为只读监看，不得评卷
    if (admin.role !== 'GRADER') {
      return NextResponse.json(
        { success: false, error: '评卷由评卷人操作，管理员仅能查看评卷进度' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Support both single grade and batch format
    let grades: { answerId: string; earnedPoints: number; comment?: string; reason?: string }[];

    const batchParsed = batchGradingSchema.safeParse(body);
    if (batchParsed.success) {
      grades = batchParsed.data.grades;
    } else {
      // Try single grade format: { answerId, earnedPoints, comment }
      const singleParsed = gradingSchema.safeParse(body);
      if (singleParsed.success) {
        grades = [singleParsed.data];
      } else {
        return NextResponse.json(
          { success: false, error: batchParsed.error.issues[0]?.message ?? '输入验证失败' },
          { status: 400 }
        );
      }
    }

    const scope = await getAdminScope(admin);
    const now = new Date();
    const gradedIds: string[] = [];
    // 改分明细（已评→重评）：记录旧分、新分、原因，写入审计日志
    const regrades: { answerId: string; from: number | null; to: number; reason: string | null }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const grade of grades) {
        // Verify the answer exists and get question points
        const answer = await tx.answer.findUnique({
          where: { id: grade.answerId },
          include: {
            question: { select: { points: true } },
            session: { select: { examId: true } },
          },
        });

        if (!answer) continue;

        // 工序權限隔離：越權評分直接略過（PRD F2-3）
        if (!(await canAccessSession(scope, answer.sessionId))) {
          continue;
        }

        // The exam's own配分 wins over the question bank default, so a 10-point
        // essay drawn from a 2-point bank question can be graded up to 10.
        const examQuestion = await tx.examQuestion.findUnique({
          where: {
            examId_questionId: {
              examId: answer.session.examId,
              questionId: answer.questionId,
            },
          },
          select: { points: true },
        });

        // Validate earned points stays within 0..max
        const maxPoints = examQuestion?.points ?? answer.question.points;
        const earnedPoints = Math.max(0, Math.min(grade.earnedPoints, maxPoints));

        // 已评→重评：记录旧分，供审计与原因追踪
        const wasGraded = answer.earnedPoints != null;
        const oldPoints = answer.earnedPoints;

        // 分數來源標示（PRD F3-4）：與 AI 建議相同視為採用，其餘視為人工修改
        const scoreSource =
          answer.aiScore == null
            ? 'MANUAL'
            : earnedPoints === answer.aiScore
              ? 'AI_ACCEPTED'
              : 'AI_MODIFIED';

        await tx.answer.update({
          where: { id: grade.answerId },
          data: {
            earnedPoints,
            isCorrect: earnedPoints > 0,
            gradedBy: admin.adminId,
            gradedAt: now,
            // 原因/评语：优先新评语，其次修改原因，否则保留原评语
            graderComment: grade.comment ?? grade.reason ?? answer.graderComment ?? null,
            scoreSource,
          },
        });

        if (wasGraded && oldPoints !== earnedPoints) {
          regrades.push({
            answerId: grade.answerId,
            from: oldPoints,
            to: earnedPoints,
            reason: grade.reason ?? grade.comment ?? null,
          });
        }

        gradedIds.push(grade.answerId);
      }

      // For each affected session, check if all answers are graded
      // and update the exam result if fully graded
      const affectedAnswers = await tx.answer.findMany({
        where: { id: { in: gradedIds } },
        select: { sessionId: true },
      });

      const uniqueSessionIds = [...new Set(affectedAnswers.map((a) => a.sessionId))];

      for (const sessionId of uniqueSessionIds) {
        const ungradedCount = await tx.answer.count({
          where: {
            sessionId,
            earnedPoints: null,
            question: { type: { in: MANUAL_GRADE_TYPES } },
          },
        });

        if (ungradedCount === 0) {
          // All answers graded - recalculate result
          const allAnswers = await tx.answer.findMany({
            where: { sessionId },
            include: { question: { select: { type: true, points: true } } },
          });

          const autoScore = allAnswers
            .filter((a) => a.earnedPoints !== null && a.gradedBy === null)
            .reduce((sum, a) => sum + (a.earnedPoints ?? 0), 0);

          const manualScore = allAnswers
            .filter((a) => a.gradedBy !== null)
            .reduce((sum, a) => sum + (a.earnedPoints ?? 0), 0);

          const totalScore = autoScore + manualScore;
          const correctCount = allAnswers.filter((a) => a.isCorrect === true).length;

          const session = await tx.examSession.findUnique({
            where: { id: sessionId },
            include: { exam: { select: { passScore: true, totalScore: true } } },
          });

          // 重算分类得分（categoryScores）—— 此前评卷后未更新，导致简答题
          // 一直显示 0 分 / 0 对。满分以本场配分(examQuestion.points)为准。
          const examQuestions = session
            ? await tx.examQuestion.findMany({
                where: { examId: session.examId, questionId: { in: allAnswers.map((a) => a.questionId) } },
                select: { questionId: true, points: true },
              })
            : [];
          const pointsMap = new Map(examQuestions.map((eq) => [eq.questionId, eq.points]));
          const categoryScores: Record<string, { type: string; earnedPoints: number; maxPoints: number; correctCount: number; totalCount: number }> = {};
          for (const a of allAnswers) {
            const type = a.question.type;
            const max = pointsMap.get(a.questionId) ?? a.question.points;
            if (!categoryScores[type]) {
              categoryScores[type] = { type, earnedPoints: 0, maxPoints: 0, correctCount: 0, totalCount: 0 };
            }
            const c = categoryScores[type];
            c.earnedPoints += a.earnedPoints ?? 0;
            c.maxPoints += max;
            c.totalCount += 1;
            if (a.isCorrect === true) c.correctCount += 1;
          }

          if (session) {
            const isPassed = totalScore >= session.exam.passScore;

            await tx.examResult.update({
              where: { sessionId },
              data: {
                totalScore,
                autoScore,
                manualScore,
                correctCount,
                isPassed,
                isFullyGraded: true,
                finalizedAt: now,
                categoryScores,
              },
            });

            await tx.examSession.update({
              where: { id: sessionId },
              data: { status: 'COMPLETED' },
            });
          }
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'MANUAL_GRADE_SUBMITTED',
          details: {
            gradedCount: gradedIds.length,
            answerIds: gradedIds,
            // 改分明细（含原因），供事后追溯「为什么改分」
            regrades,
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        gradedCount: gradedIds.length,
      },
    });
  } catch (error) {
    console.error('Submit grades error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
