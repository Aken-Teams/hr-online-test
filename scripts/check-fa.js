const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const fa = await p.question.groupBy({
    by: ['department', 'level', 'type'],
    where: { isActive: true, process: 'FA' },
    _count: true,
  });
  console.log('=== FA 工序的题目分布 (按部门) ===');
  for (const g of fa.sort((a, b) => a.department.localeCompare(b.department))) {
    console.log('  dept=' + g.department + ' level=' + (g.level || 'null') + ' type=' + g.type + ': ' + g._count);
  }

  // Also check which examSourceId they belong to
  const faExam = await p.question.groupBy({
    by: ['department', 'examSourceId'],
    where: { isActive: true, process: 'FA' },
    _count: true,
  });
  console.log('\n=== FA 工序的 examSourceId 分布 ===');
  for (const g of faExam) {
    console.log('  dept=' + g.department + ' examSourceId=' + (g.examSourceId || 'null') + ': ' + g._count);
  }

  // Check the assignment for 闫桓硕
  const user = await p.user.findFirst({ where: { name: '闫桓硕' } });
  if (user) {
    const assign = await p.examAssignment.findMany({ where: { userId: user.id } });
    console.log('\n=== 闫桓硕 的指派 ===');
    for (const a of assign) {
      console.log('  dept=' + a.department + ' process=' + a.process + ' level=' + a.level + ' examId=' + a.examId);
    }
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
