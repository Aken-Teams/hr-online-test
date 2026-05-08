const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // All unique departments in assignments
  const assignDepts = await p.examAssignment.groupBy({
    by: ['department'],
    _count: true,
  });
  console.log('=== 指派中的部门 ===');
  for (const g of assignDepts.sort((a, b) => a.department.localeCompare(b.department))) {
    console.log('  "' + g.department + '": ' + g._count + ' 人');
  }

  // All unique departments in questions
  const qDepts = await p.question.groupBy({
    by: ['department'],
    where: { isActive: true },
    _count: true,
  });
  console.log('\n=== 题库中的部门 ===');
  for (const g of qDepts.sort((a, b) => a.department.localeCompare(b.department))) {
    console.log('  "' + g.department + '": ' + g._count + ' 题');
  }

  // Find mismatches
  const assignSet = new Set(assignDepts.map(g => g.department));
  const qSet = new Set(qDepts.map(g => g.department));

  console.log('\n=== 指派中有、但题库中没有的部门 ===');
  for (const d of assignSet) {
    if (!qSet.has(d)) {
      const count = assignDepts.find(g => g.department === d)._count;
      console.log('  "' + d + '" (' + count + ' 人) - 题库中无此部门!');
    }
  }

  console.log('\n=== 题库中有、但指派中没有的部门 ===');
  for (const d of qSet) {
    if (!assignSet.has(d)) {
      const count = qDepts.find(g => g.department === d)._count;
      console.log('  "' + d + '" (' + count + ' 题)');
    }
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
