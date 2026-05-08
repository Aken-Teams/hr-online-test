const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Find the 2026 exam
  const exams = await p.exam.findMany({
    select: { id: true, title: true, basicQuestionRatio: true, totalScore: true },
  });
  console.log('=== 所有考试 ===');
  for (const e of exams) {
    console.log('  ' + e.title + ' (id=' + e.id + ', basicRatio=' + e.basicQuestionRatio + ')');
  }

  const exam = exams.find(e => e.title.includes('2026') || e.title.includes('技能'));
  if (!exam) {
    console.log('找不到 2026 考试');
    await p.$disconnect();
    return;
  }
  console.log('\n目标考试: ' + exam.title + ' (id=' + exam.id + ')');

  // Check question distribution by category
  const byCat = await p.question.groupBy({
    by: ['category'],
    where: { isActive: true, examSourceId: exam.id },
    _count: true,
  });
  console.log('\n=== 题目分类分布 ===');
  for (const g of byCat) {
    console.log('  ' + (g.category || 'null') + ': ' + g._count);
  }

  // By category + type
  const byCatType = await p.question.groupBy({
    by: ['category', 'type'],
    where: { isActive: true, examSourceId: exam.id },
    _count: true,
  });
  console.log('\n=== 题目 分类+题型 分布 ===');
  for (const g of byCatType.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.type.localeCompare(b.type))) {
    console.log('  ' + (g.category || 'null') + ' / ' + g.type + ': ' + g._count);
  }

  // Get rules
  const rules = await p.examQuestionRule.findMany({ where: { examId: exam.id } });
  console.log('\n=== 出题规则 ===');
  for (const r of rules) {
    console.log('  ' + r.questionType + ': ' + r.count + ' 题, ' + r.pointsPerQuestion + ' 分');
  }
  const totalNeeded = rules.reduce((s, r) => s + r.count, 0);
  console.log('  总需: ' + totalNeeded + ' 题');

  // Get assignments
  const assigns = await p.examAssignment.findMany({
    where: { examId: exam.id },
    include: { user: { select: { name: true, department: true } } },
  });

  // Simulate question generation for each assignment
  console.log('\n=== 模拟出题 (无基本题, 只有专业题) ===');
  const types = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'];

  // Group by combo
  const combos = new Map();
  for (const a of assigns) {
    const dept = a.department || (a.user ? a.user.department : '(unknown)');
    const key = dept + '|' + (a.process || '') + '|' + (a.level || '');
    if (!combos.has(key)) {
      combos.set(key, { dept, process: a.process, level: a.level, users: [] });
    }
    combos.get(key).users.push(a.user ? a.user.name : '(no user)');
  }

  const basicRatio = exam.basicQuestionRatio;
  console.log('basicQuestionRatio = ' + basicRatio);

  for (const [key, combo] of [...combos].sort((a, b) => a[0].localeCompare(b[0]))) {
    let totalGot = 0;
    const details = [];

    for (const rule of rules) {
      const basicCount = Math.round(rule.count * basicRatio);
      const profCount = rule.count - basicCount;

      // Check BASIC pool
      const basicPool = await p.question.count({
        where: {
          isActive: true,
          type: rule.questionType,
          category: 'BASIC',
          examSourceId: exam.id,
        },
      });

      // Check PROFESSIONAL pool (exact match)
      const profPool = await p.question.count({
        where: {
          isActive: true,
          type: rule.questionType,
          category: 'PROFESSIONAL',
          department: combo.dept,
          process: combo.process || undefined,
          level: combo.level || undefined,
          examSourceId: exam.id,
        },
      });

      // Simulate actual draw
      const gotBasic = Math.min(basicCount, basicPool);
      const gotProf = Math.min(profCount, profPool);

      // Backfill
      let total = gotBasic + gotProf;
      if (gotBasic < basicCount) {
        // Backfill from professional
        const backfill = Math.min(basicCount - gotBasic, profPool - gotProf);
        total += Math.max(0, backfill);
      }
      if (gotProf < profCount) {
        // Backfill from basic
        const backfill = Math.min(profCount - gotProf, basicPool - gotBasic);
        total += Math.max(0, backfill);
      }

      totalGot += Math.min(total, rule.count);
      const status = total < rule.count ? ' ⚠️' : '';
      details.push(rule.questionType + '=' + Math.min(total, rule.count) + '/' + rule.count + '(basic=' + basicPool + ',prof=' + profPool + ')' + status);
    }

    const statusIcon = totalGot < totalNeeded ? ' ❌' : ' ✅';
    console.log('\n  ' + combo.dept + ' / ' + (combo.process || '-') + ' / ' + (combo.level || '-') + ' [' + combo.users.length + '人]' + statusIcon + ' 总=' + totalGot + '/' + totalNeeded);
    for (const d of details) {
      console.log('    ' + d);
    }
    if (combo.users.length <= 5) {
      console.log('    人员: ' + combo.users.join(', '));
    }
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
