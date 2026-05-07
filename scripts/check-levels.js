const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Check all unique levels in questions for SAW&DB&WB&QCgate
  const levels = await p.question.groupBy({
    by: ['level', 'type'],
    where: { isActive: true, process: 'SAW&DB&WB&QCgate' },
    _count: true,
  });
  console.log('=== SAW&DB&WB&QCgate 题目 level 分布 ===');
  const levelMap = {};
  for (const g of levels) {
    const lv = g.level || '(null)';
    if (!levelMap[lv]) levelMap[lv] = {};
    levelMap[lv][g.type] = g._count;
  }
  for (const [lv, types] of Object.entries(levelMap)) {
    const parts = Object.entries(types).map(([t, c]) => t + '=' + c).join(', ');
    console.log('  level="' + lv + '": ' + parts);
  }

  // Check all unique levels across ALL questions
  console.log('\n=== 所有题目 level 值 ===');
  const allLevels = await p.question.groupBy({
    by: ['level'],
    where: { isActive: true },
    _count: true,
  });
  for (const g of allLevels) {
    console.log('  "' + (g.level || 'null') + '": ' + g._count + ' 题');
  }

  // Check all unique levels in exam assignments
  console.log('\n=== 所有指派 level 值 ===');
  const assignLevels = await p.examAssignment.groupBy({
    by: ['level'],
    _count: true,
  });
  for (const g of assignLevels) {
    console.log('  "' + (g.level || 'null') + '": ' + g._count + ' 人');
  }

  // Check inactive questions for this process (the ones we deactivated)
  const inactiveLevels = await p.question.groupBy({
    by: ['level', 'type'],
    where: { isActive: false, process: 'SAW&DB&WB&QCgate' },
    _count: true,
  });
  console.log('\n=== SAW&DB&WB&QCgate 已停用题目 level ===');
  for (const g of inactiveLevels) {
    console.log('  level="' + (g.level || 'null') + '" type=' + g.type + ': ' + g._count);
  }

  await p.$disconnect();
})();
