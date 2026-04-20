/**
 * Seed 10 test user accounts for QA testing.
 *
 * Usage:  npx tsx scripts/seed-test-users.ts
 *
 * All passwords are "123456" for easy testing.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_USERS = [
  // 工程研发部 — 4 users (FA exam with image options)
  { employeeNo: 'TEST001', name: '张伟',   department: '工程研发部', role: 'FA操作员' },
  { employeeNo: 'TEST002', name: '李娜',   department: '工程研发部', role: 'FA操作员' },
  { employeeNo: 'TEST003', name: '王强',   department: '工程研发部', role: '工程师' },
  { employeeNo: 'TEST004', name: '刘洋',   department: '工程研发部', role: '技术员' },
  // 资材部
  { employeeNo: 'TEST005', name: '陈明',   department: '资材部',     role: '仓管员' },
  { employeeNo: 'TEST006', name: '赵丽',   department: '资材部',     role: '采购员' },
  // 生产部
  { employeeNo: 'TEST007', name: '孙涛',   department: '生产部',     role: '操作员' },
  { employeeNo: 'TEST008', name: '周芳',   department: '生产部',     role: '班组长' },
  // 制程品管部
  { employeeNo: 'TEST009', name: '吴杰',   department: '制程品管部', role: '品管员' },
  // 环安部
  { employeeNo: 'TEST010', name: '郑敏',   department: '环安部',     role: '安全员' },
];

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  let created = 0;
  let skipped = 0;

  for (const u of TEST_USERS) {
    const exists = await prisma.user.findFirst({
      where: { OR: [{ employeeNo: u.employeeNo }, { name: u.name }] },
    });

    if (exists) {
      console.log(`  SKIP  ${u.employeeNo} ${u.name} (already exists)`);
      skipped++;
      continue;
    }

    await prisma.user.create({
      data: {
        employeeNo: u.employeeNo,
        name: u.name,
        department: u.department,
        role: u.role,
        idCardLast6: passwordHash,
        isActive: true,
      },
    });
    console.log(`  OK    ${u.employeeNo} ${u.name} — ${u.department} / ${u.role}`);
    created++;
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
  console.log('All test accounts use password: 123456');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
