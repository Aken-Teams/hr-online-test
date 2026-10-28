const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.admin.findMany({
    select: {
      id: true, username: true, passwordHash: true,
      displayName: true, role: true, isActive: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const candidates = ['pjws123', 'admin', 'admin123', '123456', 'pjws123456', 'Pjws123'];

  console.log(`Found ${admins.length} admin(s):\n`);
  for (const a of admins) {
    let matched = null;
    for (const c of candidates) {
      if (await bcrypt.compare(c, a.passwordHash)) { matched = c; break; }
    }
    console.log('username    :', a.username);
    console.log('displayName :', a.displayName);
    console.log('role        :', a.role);
    console.log('isActive    :', a.isActive);
    console.log('createdAt   :', a.createdAt);
    console.log('updatedAt   :', a.updatedAt);
    console.log('hashPrefix  :', a.passwordHash.slice(0, 12) + '...');
    console.log('pwd match   :', matched ? `"${matched}"` : '(none of common candidates)');
    console.log('');
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
