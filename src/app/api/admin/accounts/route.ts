import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie, hashPassword } from '@/lib/auth';
import { canManageAccounts, listKnownProcesses } from '@/lib/admin-scope';
import { getAdUser, DEFAULT_AD_DOMAIN, AD_DOMAINS, isAdConfigured } from '@/lib/ldap';

const createSchema = z
  .object({
    /** LOCAL = 系統自建帳密；AD = 綁定網域帳號，由 AD 驗證密碼 */
    authSource: z.enum(['LOCAL', 'AD']).default('LOCAL'),
    username: z.string().max(50).optional(),
    displayName: z.string().max(50).optional(),
    password: z.string().min(6, '密码至少 6 个字符').max(72).optional(),
    role: z.enum(['SUPER_ADMIN', 'HR', 'GRADER']).default('GRADER'),
    /** 共用帳號：以工序為單位共用帳密，稽核僅能追溯至工序 */
    isShared: z.boolean().default(false),
    mustChangePassword: z.boolean().default(true),
    processes: z.array(z.string().min(1)).default([]),
    /** AD 綁定用 */
    adUsername: z.string().max(100).optional(),
    adDomain: z.string().max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.authSource === 'AD') {
      if (!data.adUsername) {
        ctx.addIssue({ code: 'custom', message: '请选择要绑定的 AD 账号', path: ['adUsername'] });
      }
      return;
    }
    if (!data.username || data.username.length < 3) {
      ctx.addIssue({ code: 'custom', message: '账号至少 3 个字符', path: ['username'] });
    } else if (!/^[A-Za-z0-9._-]+$/.test(data.username)) {
      ctx.addIssue({ code: 'custom', message: '账号仅能使用英数字与 . _ -', path: ['username'] });
    }
    if (!data.displayName) {
      ctx.addIssue({ code: 'custom', message: '请输入显示名称', path: ['displayName'] });
    }
    if (!data.password) {
      ctx.addIssue({ code: 'custom', message: '请输入初始密码', path: ['password'] });
    }
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
        adUsername: true,
        adDomain: true,
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
        adUsername: a.adUsername,
        adDomain: a.adDomain,
        mustChangePassword: a.mustChangePassword,
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
        processes: a.processScopes.map((s) => s.process),
        gradedCount: a._count.gradedAnswers,
      })),
      availableProcesses: processes,
      ad: {
        configured: isAdConfigured(),
        defaultDomain: DEFAULT_AD_DOMAIN,
        domains: AD_DOMAINS,
      },
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

  // ── AD 綁定：向 AD 確認工號存在，並以其資料建立後台帳號 ──
  let adUsername: string | null = null;
  let adDomain: string | null = null;
  let username = data.username ?? '';
  let displayName = data.displayName ?? '';

  if (data.authSource === 'AD') {
    if (!isAdConfigured()) {
      return NextResponse.json(
        { success: false, error: 'AD 查询未配置（缺少 AD_API）' },
        { status: 503 }
      );
    }
    adDomain = data.adDomain || DEFAULT_AD_DOMAIN;
    const adUser = await getAdUser(data.adUsername!, adDomain);
    if (!adUser) {
      return NextResponse.json(
        { success: false, error: `AD 中查无此工号：${data.adUsername}` },
        { status: 404 }
      );
    }
    adUsername = adUser.username;
    username = `${adDomain.toLowerCase()}:${adUser.username}`;
    displayName = data.displayName || adUser.displayName || adUser.username;

    const bound = await prisma.admin.findFirst({
      where: { adDomain, adUsername },
      select: { id: true, displayName: true },
    });
    if (bound) {
      return NextResponse.json(
        { success: false, error: `此 AD 账号已绑定至「${bound.displayName}」` },
        { status: 409 }
      );
    }
  }

  const exists = await prisma.admin.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ success: false, error: '账号已存在' }, { status: 409 });
  }

  // AD 帳號的密碼由 AD 驗證，本地密碼欄位填入不可用的隨機值
  const passwordHash = await hashPassword(
    data.authSource === 'AD' ? `ad-${randomUUID()}` : data.password!
  );

  const created = await prisma.$transaction(async (tx) => {
    const account = await tx.admin.create({
      data: {
        username,
        displayName,
        passwordHash,
        role: data.role,
        isShared: data.authSource === 'AD' ? false : data.isShared,
        mustChangePassword: data.authSource === 'AD' ? false : data.mustChangePassword,
        authSource: data.authSource,
        adUsername,
        adDomain,
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
          authSource: account.authSource,
          adUsername: account.adUsername,
          adDomain: account.adDomain,
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
