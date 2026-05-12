/**
 * Repair script: find COMPLETED/GRADING sessions that have no ExamResult,
 * grade their answers, and create ExamResult records.
 *
 * Usage: node scripts/repair-ungraded-sessions.js [--dry-run]
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const AUTO_GRADABLE_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'];

// ── Inline scoring (same logic as src/lib/scoring.ts) ──

function parseMultiChoiceAnswer(raw) {
  if (raw.includes(',')) return raw.split(',').map(s => s.trim()).filter(Boolean);
  return raw.split('').filter(c => /[A-Z]/.test(c));
}

function autoGradeAnswer(question, userAnswer) {
  if (!AUTO_GRADABLE_TYPES.includes(question.type)) return null;
  if (!userAnswer || userAnswer.trim() === '') return { isCorrect: false, earnedPoints: 0 };
  if (!question.correctAnswer || question.correctAnswer.trim() === '') return { isCorrect: false, earnedPoints: 0 };

  const correct = question.correctAnswer.trim().toUpperCase();
  const given = userAnswer.trim().toUpperCase();

  if (question.type === 'SINGLE_CHOICE' || question.type === 'TRUE_FALSE') {
    const isCorrect = given === correct;
    return { isCorrect, earnedPoints: isCorrect ? question.points : 0 };
  }

  if (question.type === 'MULTI_CHOICE') {
    const correctSet = new Set(parseMultiChoiceAnswer(correct));
    const givenSet = new Set(parseMultiChoiceAnswer(given));
    const isCorrect = correctSet.size === givenSet.size && [...correctSet].every(v => givenSet.has(v));
    return { isCorrect, earnedPoints: isCorrect ? question.points : 0 };
  }

  return null;
}

const GRADE_THRESHOLDS = [
  { minPercentage: 90, label: 'A' },
  { minPercentage: 80, label: 'B' },
  { minPercentage: 70, label: 'C' },
  { minPercentage: 60, label: 'D' },
  { minPercentage: 0, label: 'F' },
];

function getGradeLabel(score, maxScore) {
  if (maxScore <= 0) return 'F';
  const pct = (score / maxScore) * 100;
  for (const t of GRADE_THRESHOLDS) {
    if (pct >= t.minPercentage) return t.label;
  }
  return 'F';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== DRY RUN MODE ===\n');

  // Find sessions that are COMPLETED/GRADING but have no ExamResult
  const brokenSessions = await prisma.examSession.findMany({
    where: {
      status: { in: ['COMPLETED', 'GRADING'] },
      result: null,
    },
    include: {
      exam: { select: { id: true, title: true, totalScore: true, passScore: true } },
      answers: {
        include: {
          question: { select: { id: true, type: true, correctAnswer: true, isMultiSelect: true } },
        },
      },
    },
  });

  console.log(`Found ${brokenSessions.length} session(s) with missing ExamResult.\n`);

  for (const session of brokenSessions) {
    console.log(`Session: ${session.id}`);
    console.log(`  Exam: ${session.exam.title}`);
    console.log(`  Answers: ${session.answers.length}`);

    // Load ExamQuestion points for this session
    const questionOrder = session.questionOrder;
    const sessionQuestionIds = Array.isArray(questionOrder) ? questionOrder : [];

    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        examId: session.examId,
        ...(sessionQuestionIds.length > 0 ? { questionId: { in: sessionQuestionIds } } : {}),
      },
      select: { questionId: true, points: true },
    });

    const pointsMap = new Map(examQuestions.map(eq => [eq.questionId, eq.points]));

    // Grade each answer
    let autoScore = 0;
    let manualScore = 0;
    let correctCount = 0;
    let hasPendingGrading = false;
    const updates = [];

    for (const answer of session.answers) {
      const points = pointsMap.get(answer.questionId) || answer.question.points || 2;
      const q = { ...answer.question, points };

      if (AUTO_GRADABLE_TYPES.includes(q.type)) {
        const result = autoGradeAnswer(q, answer.answerContent) || { isCorrect: false, earnedPoints: 0 };
        autoScore += result.earnedPoints;
        if (result.isCorrect) correctCount++;
        updates.push({ id: answer.id, isCorrect: result.isCorrect, earnedPoints: result.earnedPoints });
      } else {
        if (!answer.answerContent || answer.answerContent.trim() === '') {
          updates.push({ id: answer.id, isCorrect: false, earnedPoints: 0 });
        } else if (answer.earnedPoints != null) {
          manualScore += answer.earnedPoints;
          if (answer.isCorrect) correctCount++;
        } else {
          hasPendingGrading = true;
        }
      }
    }

    const isFullyGraded = !hasPendingGrading;
    const totalScore = isFullyGraded ? autoScore + manualScore : null;
    const maxPossibleScore = session.exam.totalScore;
    const isPassed = totalScore != null ? totalScore >= session.exam.passScore : null;
    const gradeLabel = totalScore != null ? getGradeLabel(totalScore, maxPossibleScore) : null;

    let timeTakenSeconds = 0;
    if (session.startedAt && session.submittedAt) {
      timeTakenSeconds = Math.max(0, Math.floor((new Date(session.submittedAt) - new Date(session.startedAt)) / 1000));
    }

    console.log(`  AutoScore: ${autoScore} | ManualScore: ${manualScore} | Total: ${totalScore} / ${maxPossibleScore}`);
    console.log(`  Correct: ${correctCount} / ${session.answers.length}`);
    console.log(`  Passed: ${isPassed} | Grade: ${gradeLabel}`);
    console.log(`  PendingGrading: ${hasPendingGrading}`);
    console.log(`  Answers to update: ${updates.length}`);

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        // Update answer records
        for (const u of updates) {
          await tx.answer.update({
            where: { id: u.id },
            data: { isCorrect: u.isCorrect, earnedPoints: u.earnedPoints },
          });
        }

        // Create ExamResult
        await tx.examResult.create({
          data: {
            sessionId: session.id,
            totalScore,
            autoScore,
            manualScore: isFullyGraded ? manualScore : null,
            maxPossibleScore,
            correctCount,
            totalQuestions: session.answers.length,
            timeTakenSeconds,
            isPassed,
            gradeLabel,
            isFullyGraded,
            finalizedAt: isFullyGraded ? session.submittedAt : null,
          },
        });

        // Fix session status if needed
        const correctStatus = hasPendingGrading ? 'GRADING' : 'COMPLETED';
        if (session.status !== correctStatus) {
          await tx.examSession.update({
            where: { id: session.id },
            data: { status: correctStatus },
          });
        }
      });
      console.log('  ✓ Repaired!\n');
    } else {
      console.log('  (skipped - dry run)\n');
    }
  }

  console.log('Done.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
