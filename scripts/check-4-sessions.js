const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const ids = [
    'cmow5y4n60ace125emn9630w4',
    'cmow5yite0aji125e3jep1fwf',
    'cmow8x6g70wqk125egx8us0qg',
    'cmow8y6u80x0s125e91ko0znf',
  ];

  const sessions = await prisma.examSession.findMany({
    where: { id: { in: ids } },
    include: {
      user: { select: { name: true, employeeNo: true } },
      exam: { select: { title: true, timeLimitMinutes: true } },
    },
  });

  for (const s of sessions) {
    const answerCount = await prisma.answer.count({ where: { sessionId: s.id } });
    const timeLimitSec = s.exam.timeLimitMinutes * 60;
    let elapsed = null;
    if (s.startedAt && s.submittedAt) {
      elapsed = Math.floor((new Date(s.submittedAt) - new Date(s.startedAt)) / 1000);
    }

    const audits = await prisma.auditLog.findMany({
      where: { sessionId: s.id },
      select: { action: true, timestamp: true, details: true },
      orderBy: { timestamp: 'asc' },
    });

    console.log('Session:', s.id);
    console.log('  User:', s.user.name, '(' + s.user.employeeNo + ')');
    console.log('  Status:', s.status);
    console.log('  startedAt:', s.startedAt);
    console.log('  submittedAt:', s.submittedAt);
    console.log('  Answers:', answerCount);
    console.log('  TimeLimit:', s.exam.timeLimitMinutes, 'min | Elapsed:', elapsed, 's (' + (elapsed ? Math.round(elapsed / 60) : '?') + ' min)');

    const isTimeExpired = elapsed && elapsed >= timeLimitSec - 5;
    console.log('  Time expired?:', isTimeExpired ? 'YES' : 'NO');

    console.log('  Audit logs (' + audits.length + '):');
    for (const a of audits) {
      console.log('    -', a.action, '@', a.timestamp);
    }
    console.log('');
  }

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
