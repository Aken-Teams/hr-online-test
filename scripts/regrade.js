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

const AUTO_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'];

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
    let manualScore = 0;
    let correctCount = 0;
    let hasUngradedManual = false;
    let updated = 0;
    const categoryScores = {};

    for (const answer of session.answers) {
      const q = answer.question;
      const eqPoints = q.examQuestions.find(eq => eq.examId === session.examId)?.points ?? q.points;

      // Init category
      if (!categoryScores[q.type]) {
        categoryScores[q.type] = {
          type: q.type,
          earnedPoints: 0,
          maxPoints: 0,
          correctCount: 0,
          totalCount: 0,
        };
      }
      const cat = categoryScores[q.type];
      cat.maxPoints += eqPoints;
      cat.totalCount += 1;

      if (AUTO_TYPES.includes(q.type)) {
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
          cat.earnedPoints += result.earnedPoints;
          if (result.isCorrect) {
            correctCount++;
            cat.correctCount++;
          }
        }
      } else {
        // Manual grading
        if (answer.earnedPoints != null) {
          manualScore += answer.earnedPoints;
          cat.earnedPoints += answer.earnedPoints;
          if (answer.isCorrect) {
            correctCount++;
            cat.correctCount++;
          }
        } else {
          hasUngradedManual = true;
        }
      }
    }

    if (session.result) {
      const isFullyGraded = !hasUngradedManual;
      const totalScore = isFullyGraded ? autoScore + manualScore : null;
      const maxScore = session.exam.totalScore;
      const isPassed = totalScore != null ? totalScore >= session.exam.passScore : null;
      const pct = maxScore > 0 && totalScore != null ? (totalScore / maxScore) * 100 : 0;
      let gradeLabel = 'F';
      if (pct >= 90) gradeLabel = 'A';
      else if (pct >= 80) gradeLabel = 'B';
      else if (pct >= 70) gradeLabel = 'C';
      else if (pct >= 60) gradeLabel = 'D';

      await p.examResult.update({
        where: { id: session.result.id },
        data: {
          autoScore,
          manualScore: isFullyGraded ? manualScore : null,
          totalScore,
          correctCount,
          isPassed,
          gradeLabel,
          isFullyGraded,
          categoryScores,
        }
      });

      console.log(`  ${session.id}: score ${session.result.totalScore} -> ${totalScore}, correct ${session.result.correctCount} -> ${correctCount}, answers fixed: ${updated}`);
    }
  }

  console.log('\nDone! Fetching updated results...\n');

  const results = await p.$queryRaw`
    SELECT u.name, er.total_score, er.auto_score, er.correct_count, er.is_passed, er.grade_label,
           er.category_scores
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

  // Show category breakdown for top scorer
  const top = results[0];
  if (top && top.category_scores) {
    console.log('\n=== TOP SCORER CATEGORY BREAKDOWN ===');
    const cs = typeof top.category_scores === 'string' ? JSON.parse(top.category_scores) : top.category_scores;
    console.table(Object.values(cs).map(c => ({
      type: c.type,
      earned: c.earnedPoints,
      max: c.maxPoints,
      correct: c.correctCount + '/' + c.totalCount,
      rate: c.maxPoints > 0 ? (c.earnedPoints / c.maxPoints * 100).toFixed(1) + '%' : '0%'
    })));
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
