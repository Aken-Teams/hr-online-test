const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function parseMultiChoiceAnswer(raw) {
  if (raw.includes(',')) return raw.split(',').map(s => s.trim()).filter(Boolean);
  return raw.split('').filter(c => /[A-Z]/.test(c));
}

function autoGrade(correctAnswer, userAnswer, type, points) {
  if (!userAnswer || !userAnswer.trim()) return { isCorrect: false, earnedPoints: 0 };
  if (!correctAnswer || !correctAnswer.trim()) return null;

  const correct = correctAnswer.trim().toUpperCase();
  const given = userAnswer.trim().toUpperCase();

  if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
    const isCorrect = given === correct;
    return { isCorrect, earnedPoints: isCorrect ? points : 0 };
  }

  if (type === 'MULTI_CHOICE') {
    const correctSet = new Set(parseMultiChoiceAnswer(correct));
    const givenSet = new Set(parseMultiChoiceAnswer(given));
    const isCorrect = correctSet.size === givenSet.size && [...correctSet].every(v => givenSet.has(v));
    return { isCorrect, earnedPoints: isCorrect ? points : 0 };
  }
  return null;
}

(async () => {
  const sessions = await p.examSession.findMany({
    where: { status: { in: ['COMPLETED', 'GRADING'] } },
    include: {
      exam: true,
      answers: {
        include: {
          question: {
            include: { examQuestions: true }
          }
        }
      },
      result: true,
    }
  });

  console.log('Processing', sessions.length, 'sessions...');

  for (const session of sessions) {
    let autoScore = 0;
    let correctCount = 0;
    let updated = 0;

    for (const answer of session.answers) {
      const q = answer.question;
      const eqPoints = q.examQuestions.find(eq => eq.examId === session.examId)?.points ?? q.points;

      if (['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'].includes(q.type)) {
        const result = autoGrade(q.correctAnswer, answer.answerContent, q.type, eqPoints);
        if (result) {
          if (result.isCorrect !== !!answer.isCorrect || result.earnedPoints !== answer.earnedPoints) {
            await p.answer.update({
              where: { id: answer.id },
              data: { isCorrect: result.isCorrect, earnedPoints: result.earnedPoints }
            });
            updated++;
          }
          autoScore += result.earnedPoints;
          if (result.isCorrect) correctCount++;
        }
      } else {
        autoScore += (answer.earnedPoints || 0);
        if (answer.isCorrect) correctCount++;
      }
    }

    if (session.result) {
      const totalScore = autoScore;
      const isPassed = totalScore >= session.exam.passScore;
      const pct = session.exam.totalScore > 0 ? (totalScore / session.exam.totalScore) * 100 : 0;
      let gradeLabel = 'F';
      if (pct >= 90) gradeLabel = 'A';
      else if (pct >= 80) gradeLabel = 'B';
      else if (pct >= 70) gradeLabel = 'C';
      else if (pct >= 60) gradeLabel = 'D';

      await p.examResult.update({
        where: { id: session.result.id },
        data: { autoScore, totalScore, correctCount, isPassed, gradeLabel }
      });

      console.log(`  ${session.id}: autoScore ${session.result.autoScore} -> ${autoScore}, correct ${session.result.correctCount} -> ${correctCount}, answers fixed: ${updated}`);
    }
  }

  console.log('\nDone! Fetching updated results...\n');

  const results = await p.$queryRaw`
    SELECT u.name, er.total_score, er.auto_score, er.correct_count, er.is_passed, er.grade_label
    FROM exam_results er
    JOIN exam_sessions es ON er.session_id = es.id
    JOIN users u ON es.user_id = u.id
    ORDER BY er.total_score DESC
  `;
  console.log('=== UPDATED SCORES ===');
  console.table(results.map(x => ({
    name: x.name,
    score: x.total_score,
    correct: x.correct_count,
    passed: x.is_passed ? 'YES' : 'NO',
    grade: x.grade_label
  })));

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
