import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { generateQuestionSet } from '@/lib/question-generator';
import { isInExamTimeWindow } from '@/lib/exam-batch';
import { autoGradeAnswer, calculateExamResult } from '@/lib/scoring';
import { AUTO_GRADABLE_TYPES } from '@/lib/constants';
import { Prisma } from '@prisma/client';

/** Fisher-Yates shuffle (returns a new array) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

    const shouldShuffleOptions = exam?.shuffleOptions ?? true;
    const shouldShuffleQuestions = exam?.shuffleQuestions ?? true;

    if (!exam || !['PUBLISHED', 'ACTIVE'].includes(exam.status)) {
      return NextResponse.json(
        { success: false, error: '考试不存在或未开放' },
        { status: 404 }
      );
    }

    // Check time window (batch-aware)
    const now = new Date();
    const batches = await prisma.examBatch.findMany({
      where: { examId },
      orderBy: { openAt: 'asc' },
    });
    const windowResult = isInExamTimeWindow(exam, batches, now);
    if (!windowResult.inWindow) {
      const msg = windowResult.allBatchesEnded
        ? '考试已关闭'
        : windowResult.nextBatch
          ? `不在考试时间内，下一梯次：${windowResult.nextBatch.name}`
          : exam.openAt && exam.openAt > now
            ? '考试尚未开始'
            : '考试已关闭';
      return NextResponse.json(
        { success: false, error: msg },
        { status: 403 }
      );
    }

    // Get assignmentId from request body (if provided)
    let assignmentId: string | null = null;
    let assignmentDepartment: string | null = null;
    let assignmentProcess: string | null = null;
    let assignmentLevel: string | null = null;
    try {
      const body = await request.json();
      assignmentId = body.assignmentId || null;
    } catch {
      // No body or invalid JSON — that's OK for backward compatibility
    }

    // If assignmentId provided, load assignment details
    if (assignmentId) {
      const assignment = await prisma.examAssignment.findFirst({
        where: { id: assignmentId, examId },
      });
      if (!assignment) {
        return NextResponse.json(
          { success: false, error: '考试指派不存在' },
          { status: 404 }
        );
      }
      assignmentDepartment = assignment.department;
      assignmentProcess = assignment.process;
      assignmentLevel = assignment.level;
    }

    // Check if there's already an in-progress session - resume it
    const existingSession = await prisma.examSession.findFirst({
      where: {
        examId,
        userId: employee.userId,
        ...(assignmentId ? { assignmentId } : {}),
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

      const questions = orderedQuestions.map((eq, idx) => {
        const opts = eq.question.options.map((o) => ({
          label: o.label,
          content: o.content,
          imageUrl: o.imageUrl ?? null,
        }));
        return {
          id: eq.question.id,
          type: eq.question.type,
          content: eq.question.content,
          points: eq.points,
          isMultiSelect: eq.question.isMultiSelect,
          options: shouldShuffleOptions ? shuffle(opts) : opts,
          sortOrder: idx,
        };
      });

      // Calculate remaining time
      const startTime = existingSession.startedAt ?? now;
      const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const timeRemaining = Math.max(0, exam.timeLimitMinutes * 60 - elapsedSeconds);

      // If time has expired, auto-submit instead of resuming
      if (timeRemaining <= 0) {
        try {
          const submitNow = new Date();

          // Load exam questions for scoring
          const sessionQuestionIds = (existingSession.questionOrder as string[] | null) ?? [];
          const examQuestions = await prisma.examQuestion.findMany({
            where: {
              examId,
              ...(sessionQuestionIds.length > 0 ? { questionId: { in: sessionQuestionIds } } : {}),
            },
            include: { question: true },
          });

          const questionMap = new Map(
            examQuestions.map((eq) => [eq.questionId, {
              id: eq.question.id,
              type: eq.question.type,
              correctAnswer: eq.question.correctAnswer,
              isMultiSelect: eq.question.isMultiSelect,
              points: eq.points,
            }])
          );

          // Fetch existing answers
          const existingAnswers = await prisma.answer.findMany({
            where: { sessionId: existingSession.id },
          });
          const answeredIds = new Set(existingAnswers.map((a) => a.questionId));

          let hasPendingGrading = false;

          await prisma.$transaction(async (tx) => {
            // Create blank answers for unanswered questions
            const blankAnswers = [];
            for (const [qid] of questionMap) {
              if (!answeredIds.has(qid)) {
                blankAnswers.push({ sessionId: existingSession.id, questionId: qid, answerContent: null, isFlagged: false });
              }
            }
            if (blankAnswers.length > 0) {
              await tx.answer.createMany({ data: blankAnswers });
            }

            // Re-fetch all answers after creating blanks
            const allAnswers = await tx.answer.findMany({ where: { sessionId: existingSession.id } });

            // Auto-grade
            for (const answer of allAnswers) {
              const q = questionMap.get(answer.questionId);
              if (!q) continue;
              if (AUTO_GRADABLE_TYPES.includes(q.type)) {
                const result = autoGradeAnswer(q, answer.answerContent);
                if (result) {
                  await tx.answer.update({ where: { id: answer.id }, data: { isCorrect: result.isCorrect, earnedPoints: result.earnedPoints } });
                  answer.isCorrect = result.isCorrect;
                  answer.earnedPoints = result.earnedPoints;
                }
              } else if (!answer.answerContent || answer.answerContent.trim() === '') {
                await tx.answer.update({ where: { id: answer.id }, data: { isCorrect: false, earnedPoints: 0 } });
                answer.isCorrect = false;
                answer.earnedPoints = 0;
              } else {
                hasPendingGrading = true;
              }
            }

            // Calculate result
            const examResult = calculateExamResult(
              { id: existingSession.id, examId, startedAt: existingSession.startedAt!, submittedAt: submitNow },
              allAnswers,
              Array.from(questionMap.values()),
              { passScore: exam.passScore, totalScore: exam.totalScore }
            );

            await tx.examResult.create({
              data: {
                sessionId: existingSession.id,
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
                finalizedAt: examResult.isFullyGraded ? submitNow : null,
              },
            });

            await tx.examSession.update({
              where: { id: existingSession.id },
              data: { status: hasPendingGrading ? 'GRADING' : 'COMPLETED', submittedAt: submitNow, lastActiveAt: submitNow },
            });
          }, { timeout: 15000 });

          const result = await prisma.examResult.findUnique({ where: { sessionId: existingSession.id } });

          return NextResponse.json({
            success: true,
            data: { sessionId: existingSession.id, examId, autoSubmitted: true, result },
          });
        } catch (e) {
          console.error('Auto-submit expired session error:', e);
          // Fallback: force-close the session without scoring
          await prisma.examSession.update({
            where: { id: existingSession.id },
            data: { status: 'COMPLETED', submittedAt: new Date() },
          }).catch(() => {});
          return NextResponse.json({
            success: true,
            data: { sessionId: existingSession.id, examId, autoSubmitted: true, result: null },
          });
        }
      }

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

    // Check attempt limit (scoped to assignment if provided)
    const attemptCount = await prisma.examSession.count({
      where: {
        examId,
        userId: employee.userId,
        ...(assignmentId ? { assignmentId } : {}),
      },
    });

    if (!exam.isPracticeMode && attemptCount >= exam.maxAttempts) {
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

    // Generate question set (using assignment's department/process/level if available)
    const { questions: generatedQuestions, warnings } = await generateQuestionSet(
      examId,
      assignmentDepartment || user.department,
      assignmentProcess,
      assignmentLevel
    );

    // Create ExamQuestion records + ExamSession in a transaction
    const questionOrder = shouldShuffleQuestions
      ? shuffle(generatedQuestions.map((q) => q.questionId))
      : generatedQuestions.map((q) => q.questionId);

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
          assignmentId,
          batchId: windowResult.currentBatch?.id ?? null,
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

    const questions = sortedEqs.map((eq, idx) => {
      const opts = eq.question.options.map((o) => ({
        label: o.label,
        content: o.content,
        imageUrl: o.imageUrl ?? null,
      }));
      return {
        id: eq.question.id,
        type: eq.question.type,
        content: eq.question.content,
        points: eq.points,
        isMultiSelect: eq.question.isMultiSelect,
        options: shouldShuffleOptions ? shuffle(opts) : opts,
        sortOrder: idx,
      };
    });

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
