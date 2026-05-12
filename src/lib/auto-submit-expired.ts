import { prisma } from '@/lib/prisma';
import { autoGradeAnswer, calculateExamResult } from '@/lib/scoring';
import { AUTO_GRADABLE_TYPES } from '@/lib/constants';
import { Prisma } from '@prisma/client';

interface AutoSubmitResult {
  submitted: string[];
  errors: string[];
}

/**
 * Server-side cron: auto-submit expired IN_PROGRESS sessions.
 *
 * Handles two cases:
 * (A) Time expired — startedAt + timeLimitMinutes has passed (with 30s grace)
 * (B) Tab switch limit exceeded — tabSwitchCount >= exam.tabSwitchLimit
 *
 * Runs the full grading pipeline for each session:
 * blank answers → auto-grade → calculateExamResult → ExamResult → audit log
 */
export async function autoSubmitExpiredSessions(): Promise<AutoSubmitResult> {
  const now = new Date();
  const result: AutoSubmitResult = { submitted: [], errors: [] };

  try {
    // Find all IN_PROGRESS sessions with their exam info
    const sessions = await prisma.examSession.findMany({
      where: { status: 'IN_PROGRESS', startedAt: { not: null } },
      include: {
        exam: {
          select: {
            id: true,
            timeLimitMinutes: true,
            passScore: true,
            totalScore: true,
            tabSwitchLimit: true,
          },
        },
      },
    });

    for (const session of sessions) {
      const startedAt = session.startedAt!;
      const elapsedMs = now.getTime() - startedAt.getTime();
      const timeLimitMs = session.exam.timeLimitMinutes * 60 * 1000;
      const timeExpired = elapsedMs > timeLimitMs + 30_000; // 30s grace

      const tabLimitExceeded =
        session.exam.tabSwitchLimit > 0 &&
        session.tabSwitchCount >= session.exam.tabSwitchLimit;

      if (!timeExpired && !tabLimitExceeded) continue;

      const reason = timeExpired
        ? 'server_cron_time_expired'
        : 'server_cron_tab_switch_exceeded';

      try {
        await gradeAndSubmitSession(session, reason, now);
        result.submitted.push(session.id);
      } catch (err) {
        result.errors.push(`Session ${session.id}: ${err}`);
      }
    }
  } catch (err) {
    result.errors.push(`autoSubmitExpiredSessions error: ${err}`);
  }

  return result;
}

/**
 * Grade a single session and create its ExamResult.
 * Extracted so both this cron and the start route can reuse the same logic.
 */
async function gradeAndSubmitSession(
  session: {
    id: string;
    examId: string;
    startedAt: Date | null;
    questionOrder: Prisma.JsonValue;
    exam: {
      id: string;
      timeLimitMinutes: number;
      passScore: number;
      totalScore: number;
    };
  },
  reason: string,
  submitNow: Date
): Promise<void> {
  const { examId } = session;
  const sessionQuestionIds = (session.questionOrder as string[] | null) ?? [];

  // Load exam questions for scoring
  const examQuestions = await prisma.examQuestion.findMany({
    where: {
      examId,
      ...(sessionQuestionIds.length > 0
        ? { questionId: { in: sessionQuestionIds } }
        : {}),
    },
    include: { question: true },
  });

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

  // Fetch existing answers
  const existingAnswers = await prisma.answer.findMany({
    where: { sessionId: session.id },
  });
  const answeredIds = new Set(existingAnswers.map((a) => a.questionId));

  let hasPendingGrading = false;

  await prisma.$transaction(
    async (tx) => {
      // Create blank answers for unanswered questions
      const blankAnswers = [];
      for (const [qid] of questionMap) {
        if (!answeredIds.has(qid)) {
          blankAnswers.push({
            sessionId: session.id,
            questionId: qid,
            answerContent: null,
            isFlagged: false,
          });
        }
      }
      if (blankAnswers.length > 0) {
        await tx.answer.createMany({ data: blankAnswers });
      }

      // Re-fetch all answers after creating blanks
      const allAnswers = await tx.answer.findMany({
        where: { sessionId: session.id },
      });

      // Auto-grade
      for (const answer of allAnswers) {
        const q = questionMap.get(answer.questionId);
        if (!q) continue;
        if (AUTO_GRADABLE_TYPES.includes(q.type)) {
          const graded = autoGradeAnswer(q, answer.answerContent) ?? {
            isCorrect: false,
            earnedPoints: 0,
          };
          await tx.answer.update({
            where: { id: answer.id },
            data: {
              isCorrect: graded.isCorrect,
              earnedPoints: graded.earnedPoints,
            },
          });
          answer.isCorrect = graded.isCorrect;
          answer.earnedPoints = graded.earnedPoints;
        } else if (
          !answer.answerContent ||
          answer.answerContent.trim() === ''
        ) {
          await tx.answer.update({
            where: { id: answer.id },
            data: { isCorrect: false, earnedPoints: 0 },
          });
          answer.isCorrect = false;
          answer.earnedPoints = 0;
        } else {
          hasPendingGrading = true;
        }
      }

      // Calculate result
      const examResult = calculateExamResult(
        {
          id: session.id,
          examId,
          startedAt: session.startedAt!,
          submittedAt: submitNow,
        },
        allAnswers,
        Array.from(questionMap.values()),
        { passScore: session.exam.passScore, totalScore: session.exam.totalScore }
      );

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
          categoryScores:
            (examResult.categoryScores as unknown as Prisma.InputJsonValue) ??
            undefined,
          isFullyGraded: examResult.isFullyGraded,
          finalizedAt: examResult.isFullyGraded ? submitNow : null,
        },
      });

      await tx.examSession.update({
        where: { id: session.id },
        data: {
          status: hasPendingGrading ? 'GRADING' : 'COMPLETED',
          submittedAt: submitNow,
          lastActiveAt: submitNow,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          sessionId: session.id,
          action: 'SESSION_SUBMIT',
          details: {
            examId,
            autoSubmitted: true,
            reason,
            autoScore: examResult.autoScore,
            totalScore: examResult.totalScore,
            hasPendingGrading,
          },
        },
      });
    },
    { timeout: 15000 }
  );
}
