const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const user = await p.user.findFirst({ where: { name: '高杨' } });
  const sessions = await p.examSession.findMany({
    where: { userId: user.id },
    select: { id: true, questionOrder: true, status: true },
  });
  for (const s of sessions) {
    const qo = s.questionOrder;
    console.log('Session:', s.id, 'status:', s.status, 'questions:', qo.length);

    // Check question types
    if (qo.length > 0) {
      const qs = await p.question.findMany({
        where: { id: { in: qo } },
        select: { id: true, type: true, category: true, process: true, isActive: true },
      });
      const byType = {};
      let inactiveCount = 0;
      for (const q of qs) {
        byType[q.type] = (byType[q.type] || 0) + 1;
        if (!q.isActive) inactiveCount++;
      }
      console.log('  Types:', JSON.stringify(byType));
      console.log('  Inactive questions in set:', inactiveCount);
      console.log('  Found in DB:', qs.length, '/ expected:', qo.length);
    }
  }

  await p.$disconnect();
})();
