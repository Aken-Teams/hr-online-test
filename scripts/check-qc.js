const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Check assignments with process containing 品质
  const assigns = await p.examAssignment.findMany({
    where: { process: { contains: '品质' } },
    select: { process: true, department: true, level: true, user: { select: { name: true } } },
    take: 10,
  });
  console.log('=== 工序含"品质"的考试指派 ===');
  for (const a of assigns) {
    console.log('  ' + a.user.name + ' | dept=' + a.department + ' | process=' + a.process + ' | level=' + a.level);
  }
  console.log('Total:', assigns.length);

  // List all unique processes in assignments
  const procs = await p.examAssignment.groupBy({
    by: ['process'],
    _count: true,
  });
  console.log('\n=== 所有指派工序 ===');
  for (const g of procs) {
    console.log('  ' + (g.process || '(无)') + ': ' + g._count + ' 人');
  }

  // Cross-check: which question processes match assignment processes
  const qProcs = await p.question.groupBy({
    by: ['process'],
    where: { isActive: true },
    _count: true,
  });
  const qProcSet = new Set(qProcs.map(g => g.process).filter(Boolean));
  const aProcSet = new Set(procs.map(g => g.process).filter(Boolean));

  console.log('\n=== 指派工序 vs 题库工序 对照 ===');
  for (const proc of aProcSet) {
    const match = qProcSet.has(proc) ? 'OK' : 'NO MATCH';
    console.log('  指派: ' + proc + ' -> 题库: ' + match);
  }

  await p.$disconnect();
})();
