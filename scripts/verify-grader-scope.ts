/**
 * 驗證評卷人工序隔離（PRD F2-3）
 *
 * 以真實資料建立暫時的評卷人帳號 → 檢查可見試卷是否僅限指派工序 → 自動清除。
 * 不影響既有帳號與成績資料。
 *
 * 用法：npx tsx scripts/verify-grader-scope.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const prisma = new PrismaClient();
const TEST_USERNAME = '__scope_test__';

async function main() {
  const { getAdminScope, buildSessionScopeFilter, canAccessSession, listKnownProcesses } =
    await import('../src/lib/admin-scope');

  const processes = await listKnownProcesses();
  console.log(`系統已知工序（${processes.length}）：${processes.join('、')}\n`);

  // 取兩個實際有考生的工序來測試
  const byProcess = await prisma.examAssignment.groupBy({
    by: ['process'],
    where: { process: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 3,
  });
  const target = byProcess[0]?.process;
  const other = byProcess[1]?.process;
  if (!target || !other) {
    console.log('資料不足，至少需要兩個工序的考試指派');
    return;
  }
  console.log(`測試工序：${target}（指派 ${byProcess[0]._count._all} 筆）`);
  console.log(`對照工序：${other}（指派 ${byProcess[1]._count._all} 筆）\n`);

  // 建立暫時帳號
  await prisma.admin.deleteMany({ where: { username: TEST_USERNAME } });
  const grader = await prisma.admin.create({
    data: {
      username: TEST_USERNAME,
      displayName: '工序隔離測試帳號',
      passwordHash: 'x',
      role: 'GRADER',
      processScopes: { create: [{ process: target }] },
    },
  });

  try {
    const scope = await getAdminScope({
      type: 'admin',
      adminId: grader.id,
      username: grader.username,
      role: 'GRADER',
    });
    console.log('取得範圍：', scope.processes);

    const filter = buildSessionScopeFilter(scope);
    const [totalSessions, visibleSessions] = await Promise.all([
      prisma.examSession.count(),
      prisma.examSession.count({ where: filter }),
    ]);
    console.log(`\n全部考試場次：${totalSessions}`);
    console.log(`此評卷人可見：${visibleSessions}`);

    // 可見的場次是否確實都屬於指派工序
    const visible = await prisma.examSession.findMany({
      where: filter,
      select: { id: true, assignment: { select: { process: true } }, user: { select: { role: true } } },
      take: 500,
    });
    const wrong = visible.filter((s) => (s.assignment?.process ?? s.user.role) !== target);
    console.log(`可見場次中不屬於 ${target} 的筆數：${wrong.length}（應為 0）`);

    // 其他工序的場次是否確實被擋下
    const otherSession = await prisma.examSession.findFirst({
      where: { assignment: { process: other } },
      select: { id: true },
    });
    if (otherSession) {
      const allowed = await canAccessSession(scope, otherSession.id);
      console.log(`存取 ${other} 工序試卷：${allowed ? '允許（異常！）' : '拒絕（正確）'}`);
    }

    // 未指派任何工序者應看不到任何試卷
    await prisma.adminScope.deleteMany({ where: { adminId: grader.id } });
    const emptyScope = await getAdminScope({
      type: 'admin',
      adminId: grader.id,
      username: grader.username,
      role: 'GRADER',
    });
    const emptyVisible = await prisma.examSession.count({
      where: buildSessionScopeFilter(emptyScope),
    });
    console.log(`未指派工序時可見場次：${emptyVisible}（應為 0）`);

    // HR 不受限制
    const hrScope = await getAdminScope({
      type: 'admin',
      adminId: grader.id,
      username: grader.username,
      role: 'HR',
    });
    const hrVisible = await prisma.examSession.count({
      where: buildSessionScopeFilter(hrScope),
    });
    console.log(`人資可見場次：${hrVisible}（應等於全部 ${totalSessions}）`);

    const pass =
      wrong.length === 0 && emptyVisible === 0 && hrVisible === totalSessions && visibleSessions > 0;
    console.log(`\n結果：${pass ? '✓ 工序隔離正確' : '✗ 有異常，需檢查'}`);
  } finally {
    await prisma.admin.deleteMany({ where: { username: TEST_USERNAME } });
    console.log('（測試帳號已清除）');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
