const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Find 高杨's assignment
  const user = await p.user.findFirst({
    where: { name: '高杨' },
    select: { id: true, name: true, department: true },
  });
  console.log('员工:', user.name, '| dept:', user.department);

  const assign = await p.examAssignment.findFirst({
    where: { userId: user.id },
    select: { department: true, process: true, level: true, examId: true },
  });
  console.log('指派:', 'dept=' + assign.department, 'process=' + assign.process, 'level=' + assign.level);
  console.log('examId:', assign.examId);

  // Check exam rules
  const exam = await p.exam.findUnique({
    where: { id: assign.examId },
    include: { questionRules: true },
  });
  console.log('\n=== 出题规则 (basicRatio=' + exam.basicQuestionRatio + ') ===');
  for (const r of exam.questionRules) {
    console.log('  ' + r.questionType + ': ' + r.count + ' 题');
  }

  // Check available questions per type for this process, linked to exam
  console.log('\n=== 关联考试 + 该工序的题目 ===');
  for (const r of exam.questionRules) {
    const basic = await p.question.count({
      where: { isActive: true, type: r.questionType, category: 'BASIC', examSourceId: assign.examId },
    });
    const prof = await p.question.count({
      where: { isActive: true, type: r.questionType, category: 'PROFESSIONAL', examSourceId: assign.examId, process: assign.process },
    });
    const profNoProc = await p.question.count({
      where: { isActive: true, type: r.questionType, category: 'PROFESSIONAL', examSourceId: assign.examId },
    });
    const basicCount = Math.round(r.count * exam.basicQuestionRatio);
    const profCount = r.count - basicCount;
    console.log('  ' + r.questionType + ': need=' + r.count + ' (BASIC=' + basicCount + ', PROF=' + profCount + ')');
    console.log('    BASIC pool (examSource): ' + basic);
    console.log('    PROF pool (examSource+process=' + assign.process + '): ' + prof);
    console.log('    PROF pool (examSource, any process): ' + profNoProc);
  }

  // Check broader pool (no examSourceId)
  console.log('\n=== 无关联限制的题目 (fallback) ===');
  for (const r of exam.questionRules) {
    const broad = await p.question.count({
      where: { isActive: true, type: r.questionType, department: assign.department, process: assign.process },
    });
    const broadNoProc = await p.question.count({
      where: { isActive: true, type: r.questionType, department: assign.department },
    });
    console.log('  ' + r.questionType + ': dept+process=' + broad + ', dept only=' + broadNoProc);
  }

  await p.$disconnect();
})();
