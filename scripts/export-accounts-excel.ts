/**
 * 汇出后台账号密码为 Excel（放 data/ 供交付使用）
 *
 * 密码依建立规则重组（系统不存明文）：
 *   - admin：pjxz123（操作手册约定）
 *   - 评卷人 grader_xxx：账号 + 123
 *   - AD 账号：密码由 AD 验证，不列明文
 *
 * 用法：npx tsx scripts/export-accounts-excel.ts
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
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

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: '系统管理员',
  HR: '人资',
  GRADER: '评卷人',
};

function passwordOf(username: string, authSource: string): string {
  if (authSource === 'AD') return '（由 AD 验证）';
  if (username === 'admin') return 'pjxz123';
  if (username.startsWith('grader_')) return `${username}123`;
  return '（自订，请洽管理员）';
}

async function main() {
  const admins = await prisma.admin.findMany({
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    include: { processScopes: { select: { process: true }, orderBy: { process: 'asc' } } },
  });

  const rows = admins.map((a) => ({
    角色: ROLE_LABELS[a.role] ?? a.role,
    账号: a.authSource === 'AD' ? `${a.adDomain}/${a.adUsername}` : a.username,
    密码: passwordOf(a.username, a.authSource),
    显示名称: a.displayName,
    负责工序: a.role === 'GRADER' ? a.processScopes.map((s) => s.process).join('、') : '全部工序',
    账号类型: a.authSource === 'AD' ? 'AD 绑定' : a.isShared ? '工序共用' : '个人账号',
    状态: a.isActive ? '启用' : '停用',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 26 }, { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '后台账号');

  const outPath = path.resolve(__dirname, '..', 'data', '后台账号密码.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`已汇出 ${rows.length} 个账号 → ${path.relative(path.resolve(__dirname, '..'), outPath)}`);
  console.log('\n预览：');
  rows.forEach((r) => console.log(`  ${r.角色.padEnd(6)} ${r.账号.padEnd(26)} ${r.密码}`));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
