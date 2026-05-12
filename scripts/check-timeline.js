const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const ids = [
    'cmow5y4n60ace125emn9630w4',
    'cmow5yite0aji125e3jep1fwf',
    'cmow8x6g70wqk125egx8us0qg',
    'cmow8y6u80x0s125e91ko0znf',
  ];

  for (const sid of ids) {
    const session = await prisma.examSession.findUnique({
      where: { id: sid },
      include: {
        user: { select: { name: true } },
        exam: { select: { title: true, timeLimitMinutes: true } },
      },
    });

    console.log('=== ' + session.user.name + ' ===');
    console.log('Session:', sid);
    console.log('TimeLimit:', session.exam.timeLimitMinutes, 'min');
    console.log('');

    // Get all answers sorted by answeredAt
    const answers = await prisma.answer.findMany({
      where: { sessionId: sid },
      select: { questionId: true, answerContent: true, answeredAt: true },
      orderBy: { answeredAt: 'asc' },
    });

    // Get all audit logs
    const audits = await prisma.auditLog.findMany({
      where: { sessionId: sid },
      select: { action: true, timestamp: true, details: true, ipAddress: true },
      orderBy: { timestamp: 'asc' },
    });

    // Build timeline
    const timeline = [];

    timeline.push({
      time: session.startedAt,
      event: 'SESSION_START',
      detail: '',
    });

    for (const a of answers) {
      if (a.answeredAt) {
        timeline.push({
          time: a.answeredAt,
          event: 'ANSWER_SAVED',
          detail: (a.answerContent || '(blank)').substring(0, 20),
        });
      }
    }

    for (const a of audits) {
      if (a.action !== 'SESSION_START') {
        timeline.push({
          time: a.timestamp,
          event: a.action,
          detail: a.ipAddress || '',
        });
      }
    }

    if (session.submittedAt) {
      timeline.push({
        time: session.submittedAt,
        event: 'SESSION_COMPLETED (status set)',
        detail: '',
      });
    }

    // Sort by time
    timeline.sort((a, b) => new Date(a.time) - new Date(b.time));

    // Print with relative time from start
    const startTime = new Date(session.startedAt);
    for (const t of timeline) {
      const elapsed = Math.round((new Date(t.time) - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      console.log(
        '  +' + String(mins).padStart(5) + ':' + String(secs).padStart(2, '0'),
        ' |', t.event,
        t.detail ? '(' + t.detail + ')' : ''
      );
    }

    // Check: what's the last activity before a long gap?
    const lastAnswer = answers.filter(a => a.answeredAt).sort((a, b) => new Date(b.answeredAt) - new Date(a.answeredAt))[0];
    if (lastAnswer) {
      const lastAnswerElapsed = Math.round((new Date(lastAnswer.answeredAt) - startTime) / 1000 / 60);
      const submitElapsed = Math.round((new Date(session.submittedAt) - startTime) / 1000 / 60);
      console.log('');
      console.log('  Last answer at: +' + lastAnswerElapsed + ' min');
      console.log('  Status set to COMPLETED at: +' + submitElapsed + ' min');
      console.log('  Gap (no activity): ' + (submitElapsed - lastAnswerElapsed) + ' min (' + Math.round((submitElapsed - lastAnswerElapsed) / 60) + ' hours)');
    }

    // Check: does this user have another session (the 2nd attempt)?
    const otherSessions = await prisma.examSession.findMany({
      where: { userId: session.userId, examId: session.examId, id: { not: sid } },
      select: { id: true, status: true, startedAt: true, submittedAt: true },
    });
    if (otherSessions.length > 0) {
      console.log('');
      console.log('  Other sessions for same exam:');
      for (const os of otherSessions) {
        const hasResult = await prisma.examResult.findUnique({ where: { sessionId: os.id } });
        console.log('    -', os.id, '| Status:', os.status, '| Started:', os.startedAt, '| HasResult:', !!hasResult);
      }
    }

    console.log('\n');
  }

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
