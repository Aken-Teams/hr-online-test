const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Group null-earnedPoints answers by session
  const nullAnswers = await prisma.answer.findMany({
    where: { earnedPoints: null, session: { status: { in: ['COMPLETED', 'GRADING'] } } },
    include: {
      question: { select: { type: true, correctAnswer: true } },
      session: {
        select: {
          id: true, status: true, submittedAt: true, startedAt: true,
          userId: true,
          exam: { select: { title: true, totalScore: true } },
        },
      },
    },
  });

  // Group by session
  const bySession = {};
  for (const a of nullAnswers) {
    const sid = a.session.id;
    if (!bySession[sid]) {
      bySession[sid] = {
        examTitle: a.session.exam.title,
        examTotalScore: a.session.exam.totalScore,
        status: a.session.status,
        submittedAt: a.session.submittedAt,
        userId: a.session.userId,
        nullCount: 0,
        examples: [],
      };
    }
    bySession[sid].nullCount++;
    if (bySession[sid].examples.length < 3) {
      bySession[sid].examples.push({
        type: a.question.type,
        answer: a.answerContent,
        correct: a.question.correctAnswer,
      });
    }
  }

  console.log('Sessions with null-earnedPoints auto-gradable answers:');
  console.log('Total sessions:', Object.keys(bySession).length);
  console.log('');

  for (const [sid, info] of Object.entries(bySession)) {
    // Get the ExamResult for this session
    const result = await prisma.examResult.findUnique({ where: { sessionId: sid } });

    // Get total answers for this session
    const totalAnswers = await prisma.answer.count({ where: { sessionId: sid } });
    const gradedAnswers = await prisma.answer.count({ where: { sessionId: sid, earnedPoints: { not: null } } });

    console.log('Session:', sid);
    console.log('  Exam:', info.examTitle, '| Configured total:', info.examTotalScore);
    console.log('  Status:', info.status, '| Submitted:', info.submittedAt);
    console.log('  Answers: total=' + totalAnswers, 'graded=' + gradedAnswers, 'NULL=' + info.nullCount);
    if (result) {
      console.log('  Result: total=' + result.totalScore, '/ max=' + result.maxPossibleScore,
        '| auto=' + result.autoScore, '| correct=' + result.correctCount + '/' + result.totalQuestions);
    } else {
      console.log('  Result: (none)');
    }
    console.log('  Examples:', JSON.stringify(info.examples));
    console.log('');
  }

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
