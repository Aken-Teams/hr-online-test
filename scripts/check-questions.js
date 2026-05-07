const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Override main to check SAW&DB&WB&QCgate and QC-related processes

(async () => {
  // Check questions for 品质控制 process
  const byType = await p.question.groupBy({
    by: ['type', 'category'],
    where: { isActive: true, process: '品质控制' },
    _count: true,
  });
  console.log('=== 品质控制 工序题目统计 ===');
  for (const g of byType) {
    console.log(`  ${g.type} / ${g.category || '无分类'}: ${g._count} 题`);
  }
  const total = byType.reduce((s, g) => s + g._count, 0);
  console.log(`  合计: ${total} 题`);

  // Also check with examSourceId (linked to exam)
  console.log('\n=== 有关联考试的 ===');
  const linked = await p.question.groupBy({
    by: ['type', 'category'],
    where: { isActive: true, process: '品质控制', examSourceId: { not: null } },
    _count: true,
  });
  for (const g of linked) {
    console.log(`  ${g.type} / ${g.category || '无分类'}: ${g._count} 题`);
  }
  const linkedTotal = linked.reduce((s, g) => s + g._count, 0);
  console.log(`  合计: ${linkedTotal} 题`);

  // Check exam rules
  console.log('\n=== 考试出题规则 ===');
  const exams = await p.exam.findMany({
    include: { questionRules: true },
  });
  for (const exam of exams) {
    console.log(`\n考试: ${exam.title}`);
    console.log(`基础题比例: ${exam.basicQuestionRatio}`);
    let totalQ = 0;
    for (const r of exam.questionRules) {
      console.log(`  ${r.questionType}: ${r.count} 题 x ${r.pointsPerQuestion} 分 (commonRatio: ${r.commonRatio})`);
      totalQ += r.count;
    }
    console.log(`  总出题数: ${totalQ}`);
  }

  // Check all processes
  console.log('\n=== 所有工序题目数量 ===');
  const byProcess = await p.question.groupBy({
    by: ['process', 'type'],
    where: { isActive: true },
    _count: true,
  });
  const processMap = {};
  for (const g of byProcess) {
    const proc = g.process || '(无工序)';
    if (!processMap[proc]) processMap[proc] = {};
    processMap[proc][g.type] = g._count;
  }
  for (const [proc, types] of Object.entries(processMap)) {
    const parts = Object.entries(types).map(([t, c]) => `${t}=${c}`).join(', ');
    const sum = Object.values(types).reduce((a, b) => a + b, 0);
    console.log(`  ${proc}: ${sum} 题 (${parts})`);
  }

  await p.$disconnect();
})();
