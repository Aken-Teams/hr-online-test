const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: await prisma.examSession.findMany({
          where: {
            id: { in: [
              'cmow5y4n60ace125emn9630w4',
              'cmow5yite0aji125e3jep1fwf',
              'cmow8x6g70wqk125egx8us0qg',
              'cmow8y6u80x0s125e91ko0znf',
            ] },
          },
          select: { userId: true },
        }).then(s => s.map(x => x.userId)),
      },
    },
    select: {
      id: true,
      name: true,
      employeeNo: true,
      department: true,
      role: true,
      idCardLast6: true,
      createdAt: true,
    },
  });

  for (const u of users) {
    // Check if they have exam assignments
    const assignments = await prisma.examAssignment.findMany({
      where: { userId: u.id },
      select: { examId: true, process: true, level: true, department: true },
    });

    // Count total sessions
    const sessionCount = await prisma.examSession.count({ where: { userId: u.id } });

    console.log('User:', u.name);
    console.log('  employeeNo:', u.employeeNo);
    console.log('  department:', u.department);
    console.log('  role:', u.role);
    console.log('  createdAt:', u.createdAt);
    console.log('  hasPassword:', !!u.idCardLast6);
    console.log('  assignments:', assignments.length);
    for (const a of assignments) {
      console.log('    -', a.department, '/', a.process, '/', a.level);
    }
    console.log('  totalSessions:', sessionCount);
    console.log('');
  }

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
