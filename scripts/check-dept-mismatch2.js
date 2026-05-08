const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // All unique departments in assignments (department can be null)
  const assigns = await p.examAssignment.findMany({
    select: { department: true, process: true, level: true },
  });

  const deptSet = new Set();
  for (const a of assigns) {
    if (a.department) deptSet.add(a.department);
  }
  console.log('=== 指派中的部门 ===');
  for (const d of [...deptSet].sort()) {
    const count = assigns.filter(a => a.department === d).length;
    console.log('  "' + d + '": ' + count + ' 条');
  }

  // Some assignments might have null department - check User table
  const nullDeptAssigns = assigns.filter(a => !a.department);
  console.log('\n  (无部门的指派: ' + nullDeptAssigns.length + ' 条)');

  // Get user departments from User table for assignments with userId
  const assignsWithUser = await p.examAssignment.findMany({
    include: { user: { select: { name: true, department: true } } },
  });

  // User departments
  const userDeptSet = new Set();
  for (const a of assignsWithUser) {
    if (a.user && a.user.department) userDeptSet.add(a.user.department);
  }
  console.log('\n=== 指派用户的部门 (User 表) ===');
  for (const d of [...userDeptSet].sort()) {
    const users = assignsWithUser.filter(a => a.user && a.user.department === d);
    console.log('  "' + d + '": ' + users.length + ' 人');
  }

  // Question departments
  const qDepts = await p.question.groupBy({
    by: ['department'],
    where: { isActive: true },
    _count: true,
  });
  console.log('\n=== 题库中的部门 ===');
  for (const g of qDepts.sort((a, b) => a.department.localeCompare(b.department))) {
    console.log('  "' + g.department + '": ' + g._count + ' 题');
  }

  // Cross check: user departments vs question departments
  console.log('\n=== 用户部门 vs 题库部门 对比 ===');
  for (const ud of [...userDeptSet].sort()) {
    const match = qDepts.find(g => g.department === ud);
    if (match) {
      console.log('  "' + ud + '" -> 匹配 (' + match._count + ' 题)');
    } else {
      // Try fuzzy match
      const similar = qDepts.filter(g =>
        g.department.replace(/[\/\s]/g, '').includes(ud.replace(/[\/\s]/g, '')) ||
        ud.replace(/[\/\s]/g, '').includes(g.department.replace(/[\/\s]/g, ''))
      );
      if (similar.length > 0) {
        console.log('  "' + ud + '" -> 不匹配! 可能是: ' + similar.map(s => '"' + s.department + '"(' + s._count + '题)').join(', '));
      } else {
        console.log('  "' + ud + '" -> 不匹配! 题库中无相似部门');
      }
    }
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
