import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { autoGradeAnswer, calculateExamResult } from '@/lib/scoring';
import { AUTO_GRADABLE_TYPES } from '@/lib/constants';
import { Prisma } from '@prisma/client';

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

    const { id } = await params;

    // Find the in-progress session — `id` can be either a sessionId or examId
    let session = await prisma.examSession.findFirst({
      where: {
        id,
        userId: employee.userId,
        status: 'IN_PROGRESS',
      },
      include: {
        answers: true,
        exam: true,
      },
    });

    // Fallback: try treating `id` as examId
    if (!session) {
      session = await prisma.examSession.findFirst({
        where: {
          examId: id,
          userId: employee.userId,
          status: 'IN_PROGRESS',
        },
        include: {
          answers: true,
          exam: true,
        },
      });
    }

    const examId = session?.examId ?? id;

    if (!session) {
      return NextResponse.json(
        { success: false, error: '没有进行中的考试会话' },
        { status: 404 }
      );
    }

    const now = new Date();

    // Load all questions for this exam
    const examQuestions = await prisma.examQuestion.findMany({
      where: { examId },
      include: {
        question: true,
      },
    });

    // Build question map with points from exam question config
    const questionMap = new Map(
      examQuestions.map((eq) => [
        eq.questionId,
        {
          id: eq.question.id,
          type: eq.question.type,
          correctAnswer: eq.question.correctAnswer,
          isMultiSelect: eq.question.isMultiSelect,
          points: eq.points,
        },
      ])
    );

    // Create Answer records for any unanswered questions (blank submission)
    const answeredQuestionIds = new Set(session.answers.map((a) => a.questionId));
    const allAnswers = [...session.answers];

    for (const [questionId] of questionMap) {
      if (!answeredQuestionIds.has(questionId)) {
        allAnswers.push({
          id: '', // placeholder, will be set after create
          questionId,
          answerContent: null,
          isCorrect: null,
          earnedPoints: null,
          isFlagged: false,
          answeredAt: null,
          sessionId: session.id,
          gradedBy: null,
          gradedAt: null,
          graderComment: null,
        });
      }
    }

    // Auto-grade MC/TF questions
    let hasPendingGrading = false;

    await prisma.$transaction(async (tx) => {
      // First, create missing answer records for unanswered questions
      for (const answer of allAnswers) {
        if (answer.id === '') {
          const created = await tx.answer.create({
            data: {
              sessionId: session.id,
              questionId: answer.questionId,
              answerContent: null,
              isFlagged: false,
            },
          });
          answer.id = created.id;
        }
      }

      for (const answer of allAnswers) {
        const question = questionMap.get(answer.questionId);
        if (!question) continue;

        if (AUTO_GRADABLE_TYPES.includes(question.type)) {
          const result = autoGradeAnswer(question, answer.answerContent);
          if (result) {
            await tx.answer.update({
              where: { id: answer.id },
              data: {
                isCorrect: result.isCorrect,
                earnedPoints: result.earnedPoints,
              },
            });
            // Update in-memory for calculateExamResult
            answer.isCorrect = result.isCorrect;
            answer.earnedPoints = result.earnedPoints;
          }
        } else {
          // Manual question: if blank, mark as 0 points (nothing to grade)
          if (!answer.answerContent || answer.answerContent.trim() === '') {
            await tx.answer.update({
              where: { id: answer.id },
              data: {
                isCorrect: false,
                earnedPoints: 0,
              },
            });
            answer.isCorrect = false;
            answer.earnedPoints = 0;
          } else {
            // Has content — needs manual grading
            hasPendingGrading = true;
          }
        }
      }

      // Calculate exam result
      const questions = Array.from(questionMap.values());
      const examResult = calculateExamResult(
        {
          id: session.id,
          examId: session.examId,
          startedAt: session.startedAt,
          submittedAt: now,
        },
        allAnswers,
        questions,
        {
          passScore: session.exam.passScore,
          totalScore: session.exam.totalScore,
        }
      );

      // Create ExamResult record
      await tx.examResult.create({
        data: {
          sessionId: session.id,
          totalScore: examResult.totalScore,
          autoScore: examResult.autoScore,
          manualScore: examResult.manualScore,
          maxPossibleScore: examResult.maxPossibleScore,
          correctCount: examResult.correctCount,
          totalQuestions: examResult.totalQuestions,
          timeTakenSeconds: examResult.timeTakenSeconds,
          isPassed: examResult.isPassed,
          gradeLabel: examResult.gradeLabel,
          categoryScores: (examResult.categoryScores as unknown as Prisma.InputJsonValue) ?? undefined,
          isFullyGraded: examResult.isFullyGraded,
          finalizedAt: examResult.isFullyGraded ? now : null,
        },
      });

      // Update session status
      await tx.examSession.update({
        where: { id: session.id },
        data: {
          status: hasPendingGrading ? 'GRADING' : 'COMPLETED',
          submittedAt: now,
          lastActiveAt: now,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          sessionId: session.id,
          action: 'SESSION_SUBMIT',
          details: {
            examId,
            autoScore: examResult.autoScore,
            totalScore: examResult.totalScore,
            hasPendingGrading,
          },
          ipAddress:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            null,
        },
      });
    });

    // Fetch the finalized result
    const result = await prisma.examResult.findUnique({
      where: { sessionId: session.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        result,
        hasPendingGrading,
        showResult: session.exam.showResultImmediately,
      },
    });
  } catch (error) {
    console.error('Submit exam error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
