/**
 * Seed 10 additional test user accounts (T016–T025).
 *
 * Usage:  npx tsx scripts/seed-test-users-v3.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_USERS = [
  { employeeNo: 'T016', name: '林志远', department: '工程研发部', role: '工程研发部--FA操作员',        password: '100016' },
  { employeeNo: 'T017', name: '黄晓峰', department: '工程研发部', role: '工程师',                     password: '100017' },
  { employeeNo: 'T018', name: '许雅婷', department: '工程研发部', role: '技术员',                     password: '100018' },
  { employeeNo: 'T019', name: '何建军', department: '资材部',     role: '仓管员',                     password: '100019' },
  { employeeNo: 'T020', name: '罗秀英', department: '工务部',     role: '工务部 - 设备技术员',         password: '100020' },
  { employeeNo: 'T021', name: '马国庆', department: '生产部',     role: '生产封装-操作工',             password: '100021' },
  { employeeNo: 'T022', name: '邓丽君', department: '制程品管部', role: '所有人适用',                 password: '100022' },
  { employeeNo: 'T023', name: '曹文轩', department: '环安部',     role: '所有人适用',                 password: '100023' },
  { employeeNo: 'T024', name: '彭慧敏', department: '质量部',     role: '客户质量部-IQC岗位',         password: '100024' },
  { employeeNo: 'T025', name: '萧伟杰', department: '工务部',     role: '工务部--MD&TF',              password: '100025' },
];

async function main() {
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

    const hash = await bcrypt.hash(u.password, 10);

    await prisma.user.create({
      data: {
        employeeNo: u.employeeNo,
        name: u.name,
        department: u.department,
        role: u.role,
        idCardLast6: hash,
        isActive: true,
      },
    });
    console.log(`  OK    ${u.employeeNo} ${u.name} — ${u.department} / ${u.role} (pwd: ${u.password})`);
    created++;
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
