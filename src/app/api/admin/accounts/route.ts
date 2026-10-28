import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie, hashPassword } from '@/lib/auth';
import { canManageAccounts, listKnownProcesses } from '@/lib/admin-scope';

const createSchema = z.object({
  username: z
    .string()
    .min(3, '账号至少 3 个字符')
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/, '账号仅能使用英数字与 . _ -'),
  displayName: z.string().min(1, '请输入显示名称').max(50),
  password: z.string().min(6, '密码至少 6 个字符').max(72),
  role: z.enum(['SUPER_ADMIN', 'HR', 'GRADER']).default('GRADER'),
  /** 共用帳號：以工序為單位共用帳密，稽核僅能追溯至工序 */
  isShared: z.boolean().default(false),
  mustChangePassword: z.boolean().default(true),
  processes: z.array(z.string().min(1)).default([]),
});

/** GET /api/admin/accounts — 後台帳號清單（含負責工序） */
export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
  }
  if (!canManageAccounts(admin.role)) {
    return NextResponse.json({ success: false, error: '仅系统管理员可管理账号' }, { status: 403 });
  }

  const [admins, processes] = await Promise.all([
    prisma.admin.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        isShared: true,
        authSource: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        processScopes: { select: { process: true }, orderBy: { process: 'asc' } },
        _count: { select: { gradedAnswers: true } },
      },
    }),
    listKnownProcesses(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      accounts: admins.map((a) => ({
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        role: a.role,
        isActive: a.isActive,
        isShared: a.isShared,
        authSource: a.authSource,
        mustChangePassword: a.mustChangePassword,
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
        processes: a.processScopes.map((s) => s.process),
        gradedCount: a._count.gradedAnswers,
      })),
      availableProcesses: processes,
    },
  });
}

/** POST /api/admin/accounts — 新增後台帳號並指派工序 */
export async function POST(request: Request) {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
  }
  if (!canManageAccounts(admin.role)) {
    return NextResponse.json({ success: false, error: '仅系统管理员可管理账号' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const exists = await prisma.admin.findUnique({ where: { username: data.username } });
  if (exists) {
    return NextResponse.json({ success: false, error: '账号已存在' }, { status: 409 });
  }

  const passwordHash = await hashPassword(data.password);

  const created = await prisma.$transaction(async (tx) => {
    const account = await tx.admin.create({
      data: {
        username: data.username,
        displayName: data.displayName,
        passwordHash,
        role: data.role,
        isShared: data.isShared,
        mustChangePassword: data.mustChangePassword,
        authSource: 'LOCAL',
      },
    });

    if (data.role === 'GRADER' && data.processes.length > 0) {
      await tx.adminScope.createMany({
        data: data.processes.map((process) => ({ adminId: account.id, process })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'ADMIN_CREATED',
        details: {
          targetId: account.id,
          username: account.username,
          role: account.role,
          isShared: account.isShared,
          processes: data.processes,
        },
      },
    });

    return account;
  });

  return NextResponse.json({
    success: true,
    data: { id: created.id, username: created.username },
  });
}
