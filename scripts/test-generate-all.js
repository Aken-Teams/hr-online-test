const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Replicate the question generator logic locally for testing
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchPool(params) {
  const where = { type: params.type, isActive: true };
  if (params.category) where.category = params.category;
  if (params.department) where.department = params.department;
  if (params.process) where.process = params.process;
  if (params.level) where.level = params.level;
  if (params.examSourceId) where.examSourceId = params.examSourceId;
  if (params.excludeIds && params.excludeIds.length > 0) {
    where.id = { notIn: params.excludeIds };
  }
  const questions = await p.question.findMany({
    where,
    select: { id: true },
    distinct: ['content'],
  });
  return questions.map(q => q.id);
}

async function simulateGenerate(examId, dept, process, level, rules, basicRatio) {
  const selectedIds = new Set();
  const result = [];

  for (const rule of rules) {
    const basicCount = Math.round(rule.count * basicRatio);
    const profCount = rule.count - basicCount;
    const excludeArray = [...selectedIds];

    const basicPool = await fetchPool({
      type: rule.questionType, category: 'BASIC', examSourceId: examId, excludeIds: excludeArray,
    });
    const profPool = await fetchPool({
      type: rule.questionType, category: 'PROFESSIONAL', department: dept,
      process: process || undefined, level: level || undefined,
      examSourceId: examId, excludeIds: excludeArray,
    });

    const sBasic = shuffle(basicPool);
    const sProf = shuffle(profPool);

    const pickedBasic = sBasic.slice(0, basicCount);
    const pickedProf = sProf.slice(0, profCount);
    const picked = [...pickedBasic, ...pickedProf];
    const usedIds = new Set(picked);

    // Backfill basic shortfall from prof
    const bShort = basicCount - pickedBasic.length;
    if (bShort > 0) {
      const rem = sProf.filter(id => !usedIds.has(id));
      for (const id of rem.slice(0, bShort)) { picked.push(id); usedIds.add(id); }
    }
    // Backfill prof shortfall from basic
    const pShort = profCount - pickedProf.length;
    if (pShort > 0) {
      const rem = sBasic.filter(id => !usedIds.has(id));
      for (const id of rem.slice(0, pShort)) { picked.push(id); usedIds.add(id); }
    }
    // Fallback: broader search without examSourceId
    if (picked.length < rule.count) {
      const broadPool = await fetchPool({
        type: rule.questionType, department: dept,
        process: process || undefined, level: level || undefined,
        excludeIds: [...excludeArray, ...picked],
      });
      const unique = shuffle(broadPool).filter(id => !usedIds.has(id));
      for (const id of unique.slice(0, rule.count - picked.length)) {
        picked.push(id); usedIds.add(id);
      }
    }

    for (const id of picked) {
      selectedIds.add(id);
      result.push({ questionId: id, type: rule.questionType });
    }
  }

  return result;
}

(async () => {
  const exam = await p.exam.findFirst({ select: { id: true, title: true, basicQuestionRatio: true } });
  const rules = await p.examQuestionRule.findMany({ where: { examId: exam.id } });

  console.log('考试: ' + exam.title + ' (basicRatio=' + exam.basicQuestionRatio + ')');
  console.log('规则: ' + rules.map(r => r.questionType + '×' + r.count).join(', '));
  console.log('');

  // Get all assignments grouped by unique combo
  const assigns = await p.examAssignment.findMany({
    where: { examId: exam.id },
    include: { user: { select: { name: true, department: true } } },
  });

  const combos = new Map();
  for (const a of assigns) {
    const dept = a.department || (a.user ? a.user.department : '?');
    const key = dept + '|' + (a.process || '') + '|' + (a.level || '');
    if (!combos.has(key)) {
      combos.set(key, { dept, process: a.process, level: a.level, users: [] });
    }
    combos.get(key).users.push(a.user ? a.user.name : '?');
  }

  let allPass = true;

  for (const [key, combo] of [...combos].sort((a, b) => a[0].localeCompare(b[0]))) {
    const result = await simulateGenerate(
      exam.id, combo.dept, combo.process, combo.level, rules, exam.basicQuestionRatio
    );

    // Check total
    const total = result.length;
    // Check uniqueness
    const ids = result.map(r => r.questionId);
    const uniqueIds = new Set(ids);
    const hasDupes = uniqueIds.size !== ids.length;

    // Check by type
    const byType = {};
    for (const r of result) {
      byType[r.type] = (byType[r.type] || 0) + 1;
    }

    const pass = total === 50 && !hasDupes;
    if (!pass) allPass = false;

    const icon = pass ? '✅' : '❌';
    const dupeMsg = hasDupes ? ' [重复!]' : '';
    console.log(
      icon + ' ' + combo.dept + ' / ' + (combo.process || '-') + ' / ' + (combo.level || '-') +
      ' [' + combo.users.length + '人] → ' + total + '/50' + dupeMsg +
      '  (' + Object.entries(byType).map(([t, c]) => t + '=' + c).join(', ') + ')'
    );

    if (!pass) {
      console.log('   人员: ' + combo.users.join(', '));
    }
  }

  console.log('\n' + (allPass ? '✅ 全部通过!' : '❌ 有不通过的组合'));

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
