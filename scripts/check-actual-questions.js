const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Get all exam sessions with their actual question counts
  const sessions = await p.examSession.findMany({
    include: {
      user: { select: { name: true, department: true } },
      assignment: { select: { department: true, process: true, level: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { startedAt: 'desc' },
  });

  console.log('=== 所有考试场次的实际题目数 ===\n');

  for (const s of sessions) {
    // Count exam questions for this exam
    const eqCount = await p.examQuestion.count({ where: { examId: s.examId } });

    // The questionOrder field tells us how many questions this user actually got
    const qOrder = s.questionOrder;
    const actualCount = Array.isArray(qOrder) ? qOrder.length : 0;

    const dept = s.assignment?.department || s.user?.department || '?';
    const proc = s.assignment?.process || '?';
    const level = s.assignment?.level || '?';

    const status = actualCount < 50 ? ' ⚠️ 不足!' : '';
    console.log(
      s.user?.name + ' | dept=' + dept + ' proc=' + proc + ' level=' + level +
      ' | 实际题数=' + actualCount + ' | 答题数=' + s._count.answers +
      ' | status=' + s.status + status
    );
  }

  // Also check: are there any users who haven't started yet but would get < 50?
  // Check all assignments
  console.log('\n\n=== 检查所有指派的题库充足性 ===\n');

  const assigns = await p.examAssignment.findMany({
    include: {
      user: { select: { name: true, department: true } },
      exam: { select: { id: true, title: true, basicQuestionRatio: true } },
    },
  });

  const rules = await p.examQuestionRule.findMany();
  const types = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'];

  let problemCount = 0;

  for (const a of assigns) {
    const dept = a.department || (a.user ? a.user.department : null);
    const proc = a.process;
    const level = a.level;
    const examId = a.exam.id;
    const basicRatio = a.exam.basicQuestionRatio;

    let totalGot = 0;
    const issues = [];

    for (const rule of rules) {
      if (rule.examId !== examId) continue;

      const basicCount = Math.round(rule.count * basicRatio);
      const profCount = rule.count - basicCount;

      // BASIC pool
      const basicPool = await p.question.count({
        where: { isActive: true, type: rule.questionType, category: 'BASIC', examSourceId: examId },
      });

      // PROFESSIONAL pool - exact match
      const where = {
        isActive: true,
        type: rule.questionType,
        category: 'PROFESSIONAL',
        examSourceId: examId,
      };
      if (dept) where.department = dept;
      if (proc) where.process = proc;
      if (level) where.level = level;

      const profPool = await p.question.count({ where });

      // Simulate with backfill
      const gotBasic = Math.min(basicCount, basicPool);
      const gotProf = Math.min(profCount, profPool);
      let total = gotBasic + gotProf;

      // Backfill basic shortfall from prof
      if (gotBasic < basicCount) {
        const extra = Math.min(basicCount - gotBasic, Math.max(0, profPool - gotProf));
        total += extra;
      }
      // Backfill prof shortfall from basic
      if (gotProf < profCount) {
        const extra = Math.min(profCount - gotProf, Math.max(0, basicPool - gotBasic));
        total += extra;
      }

      const got = Math.min(total, rule.count);
      totalGot += got;

      if (got < rule.count) {
        issues.push(rule.questionType + '=' + got + '/' + rule.count + ' (basic=' + basicPool + ',prof=' + profPool + ')');
      }
    }

    if (totalGot < 50) {
      problemCount++;
      console.log('❌ ' + (a.user ? a.user.name : '(no user)') + ' | dept=' + (dept || 'null') + ' proc=' + (proc || 'null') + ' level=' + (level || 'null') + ' | 预计=' + totalGot + '/50');
      for (const issue of issues) {
        console.log('   ' + issue);
      }
    }
  }

  if (problemCount === 0) {
    console.log('✅ 所有 ' + assigns.length + ' 个指派都能出满 50 题');
  } else {
    console.log('\n共 ' + problemCount + ' 个指派题目不足');
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
