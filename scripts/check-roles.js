const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Check question roles by process
  const data = await p.question.groupBy({
    by: ['process', 'role'],
    where: { isActive: true },
    _count: true,
  });
  const map = {};
  for (const g of data) {
    const proc = g.process || '(无)';
    if (!map[proc]) map[proc] = {};
    map[proc][g.role] = g._count;
  }
  console.log('=== 题目 role 按工序 ===');
  for (const [proc, roles] of Object.entries(map)) {
    const parts = Object.entries(roles).map(([r, c]) => '"' + r + '"=' + c).join(', ');
    console.log('  ' + proc + ': ' + parts);
  }
  await p.$disconnect();
})();
