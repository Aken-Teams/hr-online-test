const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Get all assignments raw
  const assigns = await p.examAssignment.findMany({
    select: { department: true, process: true, level: true, userId: true },
  });
  console.log('Total assignments: ' + assigns.length);

  // Unique assignment departments
  const aDepts = {};
  for (const a of assigns) {
    const d = a.department || '(null)';
    aDepts[d] = (aDepts[d] || 0) + 1;
  }
  console.log('\n=== 指派中的部门 ===');
  for (const [d, c] of Object.entries(aDepts).sort()) {
    console.log('  "' + d + '": ' + c);
  }

  // Get user departments
  const users = await p.user.findMany({ select: { id: true, name: true, department: true } });
  const uDepts = {};
  for (const u of users) {
    uDepts[u.department] = (uDepts[u.department] || 0) + 1;
  }
  console.log('\n=== User 表中的部门 ===');
  for (const [d, c] of Object.entries(uDepts).sort()) {
    console.log('  "' + d + '": ' + c);
  }

  // Question departments
  const raw = await p.$queryRaw`SELECT department, COUNT(*) as cnt FROM questions WHERE is_active = true GROUP BY department ORDER BY department`;
  console.log('\n=== 题库中的部门 ===');
  for (const r of raw) {
    console.log('  "' + r.department + '": ' + r.cnt);
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
