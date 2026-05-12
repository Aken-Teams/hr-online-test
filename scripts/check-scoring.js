const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const results = await prisma.examResult.findMany({
    where: { totalScore: { not: null } },
    include: {
      session: {
        include: {
          exam: { select: { title: true, totalScore: true, timeLimitMinutes: true } },
          answers: { select: { answerContent: true, earnedPoints: true, isCorrect: true } },
        },
      },
    },
    orderBy: { totalScore: 'desc' },
  });

  let foundPerfectUnanswered = false;

  for (const r of results) {
    const totalAnswers = r.session.answers.length;
    const unanswered = r.session.answers.filter(a => !a.answerContent || a.answerContent.trim() === '').length;
    const isPerfect = r.totalScore === r.maxPossibleScore;
    const autoIsPerfect = r.autoScore === r.maxPossibleScore;

    if ((isPerfect || autoIsPerfect) && unanswered > 0) {
      foundPerfectUnanswered = true;
      console.log('=== FOUND: Perfect score with unanswered questions ===');
      console.log('  Session:', r.sessionId);
      console.log('  Exam:', r.session.exam.title);
      console.log('  totalScore:', r.totalScore, '/', r.maxPossibleScore);
      console.log('  autoScore:', r.autoScore, '| manualScore:', r.manualScore);
      console.log('  correctCount:', r.correctCount, '/', r.totalQuestions);
      console.log('  Total answers:', totalAnswers, '| Unanswered:', unanswered);
      console.log('  timeTaken:', r.timeTakenSeconds, 's | examLimit:', r.session.exam.timeLimitMinutes, 'min');
      console.log('  isFullyGraded:', r.isFullyGraded);

      // Show per-answer detail
      const answered = r.session.answers.filter(a => a.answerContent && a.answerContent.trim() !== '');
      const correctAnswered = answered.filter(a => a.isCorrect === true);
      const wrongAnswered = answered.filter(a => a.isCorrect === false);
      const nullGraded = r.session.answers.filter(a => a.earnedPoints === null);
      console.log('  Answered:', answered.length, '| Correct:', correctAnswered.length, '| Wrong:', wrongAnswered.length);
      console.log('  Null earnedPoints:', nullGraded.length);
      console.log('---');
    }
  }

  if (!foundPerfectUnanswered) {
    console.log('No cases found: perfect score + unanswered questions.');
  }

  // Also check for null earnedPoints on any auto-gradable answers
  const nullEarned = await prisma.answer.count({
    where: { earnedPoints: null, session: { status: { in: ['COMPLETED', 'GRADING'] } } },
  });
  console.log('\nAnswers with null earnedPoints (completed sessions):', nullEarned);

  // Check questions with missing correctAnswer
  const missingCorrect = await prisma.question.count({
    where: {
      type: { in: ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'] },
      OR: [{ correctAnswer: null }, { correctAnswer: '' }],
      isActive: true,
    },
  });
  console.log('Active auto-gradable questions with missing correctAnswer:', missingCorrect);

  // Summary
  console.log('\n=== Summary ===');
  console.log('Total exam results:', results.length);
  const perfect = results.filter(r => r.totalScore === r.maxPossibleScore);
  console.log('Perfect scores (total==max):', perfect.length);
  const withUnanswered = results.filter(r =>
    r.session.answers.some(a => !a.answerContent || a.answerContent.trim() === '')
  );
  console.log('Results with unanswered questions:', withUnanswered.length);

  await prisma.$disconnect();
}

check().catch(e => { console.error(e); process.exit(1); });
