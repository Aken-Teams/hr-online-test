import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { batchGradingSchema, gradingSchema } from '@/lib/validators';
import { MANUAL_GRADE_TYPES } from '@/lib/constants';

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

    const sessionWhere: Record<string, unknown> = {
      status: { in: ['SUBMITTED', 'GRADING', 'AUTO_SUBMITTED', 'COMPLETED'] },
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
            user: {
              select: {
                id: true,
                name: true,
                employeeNo: true,
                department: true,
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

    // Split into pending and graded
    const pendingAnswers = allManualAnswers.filter((a) => a.earnedPoints === null);
    const gradedAnswers = allManualAnswers.filter((a) => a.earnedPoints !== null);

    // Map ALL answers (pending first, then graded) for the frontend
    const mapAnswer = (a: typeof allManualAnswers[number]) => ({
      answerId: a.id,
      sessionId: a.sessionId,
      employeeName: a.session.user.name,
      department: a.session.user.department ?? '',
      questionContent: a.question.content,
      questionType: a.question.type,
      maxPoints: a.question.points,
      answerContent: a.answerContent,
      earnedPoints: a.earnedPoints,
      graderComment: a.graderComment,
      isGraded: a.earnedPoints != null,
      referenceAnswer: a.question.referenceAnswer,
      gradingRubric: a.question.gradingRubric,
    });

    // Pending answers first, then graded ones
    const answers = [
      ...pendingAnswers.map(mapAnswer),
      ...gradedAnswers.map(mapAnswer),
    ];

    return NextResponse.json({
      success: true,
      data: {
        examTitle,
        totalPending: pendingAnswers.length,
        gradedCount: gradedAnswers.length,
        answers,
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

    const body = await request.json();

    // Support both single grade and batch format
    let grades: { answerId: string; earnedPoints: number; comment?: string }[];

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

    const now = new Date();
    const gradedIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const grade of grades) {
        // Verify the answer exists and get question points
        const answer = await tx.answer.findUnique({
          where: { id: grade.answerId },
          include: {
            question: { select: { points: true } },
          },
        });

        if (!answer) continue;

        // Validate earned points does not exceed max
        const maxPoints = answer.question.points;
        const earnedPoints = Math.min(grade.earnedPoints, maxPoints);

        await tx.answer.update({
          where: { id: grade.answerId },
          data: {
            earnedPoints,
            isCorrect: earnedPoints > 0,
            gradedBy: admin.adminId,
            gradedAt: now,
            graderComment: grade.comment ?? null,
          },
        });

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
