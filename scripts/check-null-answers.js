const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const nullAnswers = await prisma.answer.findMany({
    where: { earnedPoints: null, session: { status: { in: ['COMPLETED', 'GRADING'] } } },
    include: {
      question: { select: { type: true, correctAnswer: true } },
      session: { select: { status: true } },
    },
  });

  const byType = {};
  for (const a of nullAnswers) {
    const t = a.question.type;
    if (!byType[t]) byType[t] = { count: 0, hasContent: 0, noContent: 0, noCorrectAnswer: 0 };
    byType[t].count++;
    if (a.answerContent && a.answerContent.trim()) byType[t].hasContent++;
    else byType[t].noContent++;
    if (!a.question.correctAnswer || a.question.correctAnswer.trim() === '') byType[t].noCorrectAnswer++;
  }

  console.log('Null earnedPoints by question type:');
  for (const [type, stats] of Object.entries(byType)) {
    console.log('  ' + type + ':', JSON.stringify(stats));
  }

  // Check auto-gradable
  const autoGradable = nullAnswers.filter(a =>
    ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'].includes(a.question.type)
  );
  if (autoGradable.length > 0) {
    console.log('\n=== BUG: Auto-gradable with null earnedPoints ===');
    for (const a of autoGradable.slice(0, 5)) {
      console.log('  ID:', a.id, '| Type:', a.question.type,
        '| Answer:', (a.answerContent || '(blank)').substring(0, 30),
        '| CorrectAns:', a.question.correctAnswer,
        '| Status:', a.session.status);
    }
    console.log('  Total:', autoGradable.length);
  } else {
    console.log('\nAll null-earnedPoints are manual types (normal for GRADING status).');
  }

  // By session status
  const byStatus = {};
  for (const a of nullAnswers) {
    const s = a.session.status;
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  console.log('\nNull earnedPoints by session status:', byStatus);

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
