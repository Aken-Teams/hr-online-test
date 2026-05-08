const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Get all completed sessions with < 50 questions
  const sessions = await p.examSession.findMany({
    where: { status: { in: ['COMPLETED', 'IN_PROGRESS'] } },
    include: {
      user: { select: { name: true, department: true } },
      assignment: true,
      exam: { select: { id: true, title: true, basicQuestionRatio: true } },
    },
    orderBy: { startedAt: 'asc' },
  });

  console.log('=== 详细分析每个场次 ===\n');

  for (const s of sessions) {
    const qOrder = Array.isArray(s.questionOrder) ? s.questionOrder : [];
    if (qOrder.length === 50 && s.status === 'COMPLETED') continue; // Skip normal ones

    const dept = s.assignment?.department || s.user?.department || '?';
    const proc = s.assignment?.process || '(null)';
    const level = s.assignment?.level || '(null)';
    const hasAssignment = !!s.assignmentId;

    console.log('--- ' + s.user?.name + ' ---');
    console.log('  题数: ' + qOrder.length + '/50 | 状态: ' + s.status);
    console.log('  开始时间: ' + (s.startedAt ? s.startedAt.toISOString() : 'null'));
    console.log('  有 assignment: ' + hasAssignment + ' | assignmentId: ' + (s.assignmentId || 'null'));
    console.log('  dept=' + dept + ' proc=' + proc + ' level=' + level);

    if (!hasAssignment) {
      console.log('  ⚠️ 没有 assignmentId! 出题时 process/level 为 null');
    }

    // Check what questions are in questionOrder
    if (qOrder.length > 0 && qOrder.length < 50) {
      // Check the types of questions they got
      const questions = await p.question.findMany({
        where: { id: { in: qOrder } },
        select: { id: true, type: true, category: true, department: true, process: true, level: true },
      });

      const byType = {};
      for (const q of questions) {
        const key = q.type;
        byType[key] = (byType[key] || 0) + 1;
      }
      console.log('  已出题型: ' + JSON.stringify(byType));

      // Check unique categories
      const cats = [...new Set(questions.map(q => q.category))];
      console.log('  题目分类: ' + cats.join(', '));

      // Check processes
      const procs = [...new Set(questions.map(q => q.process))];
      console.log('  题目工序: ' + procs.join(', '));
    }

    // Simulate what they SHOULD get now
    if (hasAssignment && s.assignment) {
      const rules = await p.examQuestionRule.findMany({ where: { examId: s.examId } });
      const basicRatio = s.exam.basicQuestionRatio;

      let simTotal = 0;
      for (const rule of rules) {
        const basicCount = Math.round(rule.count * basicRatio);
        const profCount = rule.count - basicCount;

        const basicPool = await p.question.count({
          where: { isActive: true, type: rule.questionType, category: 'BASIC', examSourceId: s.examId },
        });

        const profWhere = {
          isActive: true,
          type: rule.questionType,
          category: 'PROFESSIONAL',
          examSourceId: s.examId,
        };
        if (s.assignment.department) profWhere.department = s.assignment.department;
        if (s.assignment.process) profWhere.process = s.assignment.process;
        if (s.assignment.level) profWhere.level = s.assignment.level;

        const profPool = await p.question.count({ where: profWhere });

        const gotBasic = Math.min(basicCount, basicPool);
        const gotProf = Math.min(profCount, profPool);
        let total = gotBasic + gotProf;
        if (gotBasic < basicCount) total += Math.min(basicCount - gotBasic, Math.max(0, profPool - gotProf));
        if (gotProf < profCount) total += Math.min(profCount - gotProf, Math.max(0, basicPool - gotBasic));
        simTotal += Math.min(total, rule.count);
      }
      console.log('  现在模拟出题: ' + simTotal + '/50');
    }

    console.log('');
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
