const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

const users = [
  { employeeNo: 'T001', name: '赵六',   department: '资材部',     role: '所有人适用',                    password: '100001' },
  { employeeNo: 'T002', name: '钱七',   department: '工务部',     role: '工务-切割技术员',                password: '100002' },
  { employeeNo: 'T003', name: '孙八',   department: '工务部',     role: '工务部 - 终测 1',                password: '100003' },
  { employeeNo: 'T004', name: '周九',   department: '工务部',     role: '工务部 - 设备技术员',            password: '100004' },
  { employeeNo: 'T005', name: '吴十',   department: '工务部',     role: '工务部--MD&TF',                  password: '100005' },
  { employeeNo: 'T006', name: '郑小明', department: '生产部',     role: '生产封装-操作工',                password: '100006' },
  { employeeNo: 'T007', name: '冯小红', department: '生产部',     role: '生产部-切弯脚',                  password: '100007' },
  { employeeNo: 'T008', name: '陈大伟', department: '生产部',     role: '生产封装-成型操作工',            password: '100008' },
  { employeeNo: 'T009', name: '褚建国', department: '制程品管部', role: '所有人适用',                    password: '100009' },
  { employeeNo: 'T010', name: '卫志强', department: '工程研发部', role: '工程研发部--FA操作员',            password: '100010' },
  { employeeNo: 'T011', name: '蒋美丽', department: '环安部',     role: '所有人适用',                    password: '100011' },
  { employeeNo: 'T012', name: '沈国强', department: '质量部',     role: '客户质量部-IQC岗位',            password: '100012' },
  { employeeNo: 'T013', name: '韩小芳', department: '质量部',     role: '客户质量部-信赖性试验员岗位',    password: '100013' },
  { employeeNo: 'T014', name: '杨文华', department: '工务部',     role: '工务部 - PT1',                  password: '100014' },
  { employeeNo: 'T015', name: '朱丽萍', department: '生产部',     role: '一级技能',                      password: '100015' },
];

async function main() {
  let created = 0;
  for (const u of users) {
    const existing = await p.user.findFirst({ where: { employeeNo: u.employeeNo } });
    if (existing) {
      console.log('SKIP ' + u.employeeNo + ' ' + u.name + ' (already exists)');
      continue;
    }
    const hash = await bcrypt.hash(u.password, 10);
    await p.user.create({
      data: {
        employeeNo: u.employeeNo,
        name: u.name,
        department: u.department,
        role: u.role,
        idCardLast6: hash,
        isActive: true,
      },
    });
    created++;
    console.log('OK   ' + u.employeeNo + ' | ' + u.name + ' | ' + u.department + ' | ' + u.role + ' | pwd: ' + u.password);
  }

  console.log('\nCreated ' + created + ' / ' + users.length + ' users');
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
