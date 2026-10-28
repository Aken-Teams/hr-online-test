/**
 * 为每个有简答题的工序建立一个评卷人账号（PRD F2）
 *
 * - 账号名：grader_<工序代码>（英数小写，& 与中文转为可读代码）
 * - 密码：账号 + 123（依需求，供初期发放/测试用）
 * - 角色：评卷人（GRADER），isShared=false，负责该工序
 * - 已存在同名账号则跳过，可安全重跑
 *
 * 用法：
 *   npx tsx scripts/create-grader-accounts.ts          # 预览
 *   npx tsx scripts/create-grader-accounts.ts --apply  # 实际建立
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
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

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

/** 中文工序对照英数代码（username 不能含中文／&） */
const SLUG_MAP: Record<string, string> = {
  仓管: 'cangguan',
  信赖性: 'xinlaixing',
};

/** 工序 → 合法账号后缀 */
function slug(process: string): string {
  if (SLUG_MAP[process]) return SLUG_MAP[process];
  return process
    .toLowerCase()
    .replace(/&/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

async function main() {
  const rows = await prisma.question.findMany({
    where: { type: 'SHORT_ANSWER', process: { not: null } },
    select: { process: true },
    distinct: ['process'],
  });
  const processes = [...new Set(rows.map((r) => r.process!).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-Hant')
  );

  console.log(`有简答题的工序：${processes.length} 个\n`);

  const plan: { process: string; username: string; password: string; exists: boolean }[] = [];
  for (const process of processes) {
    const username = `grader_${slug(process)}`;
    const password = `${username}123`;
    const exists = (await prisma.admin.findUnique({ where: { username } })) !== null;
    plan.push({ process, username, password, exists });
  }

  console.log('工序'.padEnd(22) + '账号'.padEnd(28) + '密码'.padEnd(28) + '状态');
  for (const p of plan) {
    console.log(
      p.process.padEnd(22) +
        p.username.padEnd(28) +
        p.password.padEnd(28) +
        (p.exists ? '已存在，跳过' : '待建立')
    );
  }

  const toCreate = plan.filter((p) => !p.exists);
  console.log(`\n待建立：${toCreate.length} 个　已存在：${plan.length - toCreate.length} 个`);

  if (!APPLY) {
    console.log('\n（预览模式，未写入。加上 --apply 实际建立）');
    return;
  }

  let created = 0;
  for (const p of toCreate) {
    await prisma.$transaction(async (tx) => {
      const account = await tx.admin.create({
        data: {
          username: p.username,
          displayName: `${p.process} 评卷人`,
          passwordHash: await bcrypt.hash(p.password, 10),
          role: 'GRADER',
          isShared: false,
          mustChangePassword: false,
          authSource: 'LOCAL',
          processScopes: { create: [{ process: p.process }] },
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'ADMIN_CREATED',
          details: {
            targetId: account.id,
            username: account.username,
            role: 'GRADER',
            processes: [p.process],
            via: 'scripts/create-grader-accounts.ts',
          },
        },
      });
    });
    created += 1;
    console.log(`  ✓ ${p.username}`);
  }

  console.log(`\n已建立 ${created} 个评卷人账号。`);
  console.log('密码规则：账号 + 123（例如 grader_saw 的密码为 grader_saw123）');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
