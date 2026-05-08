const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const assignments = await p.examAssignment.findMany({
    include: {
      user: { select: { name: true, employeeNo: true } },
      exam: { select: { id: true, title: true, totalScore: true } },
    },
  });

  // Get exam question rules to know expected counts
  const rules = await p.examQuestionRule.findMany();
  console.log('=== 出题规则 ===');
  for (const r of rules) {
    console.log(`  ${r.questionType}: ${r.count} 题, ${r.pointsPerQuestion} 分`);
  }

  const types = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'];

  // Group by unique department+process+level combos
  const combos = new Map();
  for (const a of assignments) {
    const key = `${a.department}|${a.process || ''}|${a.level || ''}`;
    if (!combos.has(key)) {
      combos.set(key, { dept: a.department, process: a.process, level: a.level, users: [], examId: a.exam.id });
    }
    combos.get(key).users.push(a.user.name);
  }

  console.log('\n=== 各组合的题库分析 ===');

  for (const [key, combo] of combos) {
    console.log(`\n--- ${combo.dept} / ${combo.process || '(无)'} / ${combo.level || '(无)'} [${combo.users.length}人] ---`);
    console.log(`   人员: ${combo.users.slice(0, 5).join(', ')}${combo.users.length > 5 ? '...' : ''}`);

    let totalAvailable = 0;
    for (const type of types) {
      // Exact match: same dept + process + level
      const exact = await p.question.count({
        where: {
          isActive: true,
          type,
          department: combo.dept,
          process: combo.process || undefined,
          level: combo.level || undefined,
          examSourceId: combo.examId,
        },
      });
      // Broader: same dept + process, any level
      const anyLevel = await p.question.count({
        where: {
          isActive: true,
          type,
          department: combo.dept,
          process: combo.process || undefined,
          examSourceId: combo.examId,
        },
      });

      const rule = rules.find(r => r.questionType === type);
      const needed = rule ? rule.count : '?';
      const status = (rule && exact < rule.count) ? ' ⚠️ 不足!' : '';
      console.log(`   ${type}: pool=${exact} (any_level=${anyLevel}), need=${needed}${status}`);
      totalAvailable += exact;
    }
    console.log(`   总可用: ${totalAvailable}`);
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
