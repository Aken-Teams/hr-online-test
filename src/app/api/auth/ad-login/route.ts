import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAdminToken } from '@/lib/auth';
import {
  authenticateAdUser,
  isAdAuthAvailable,
  AD_DOMAINS,
  DEFAULT_AD_DOMAIN,
  AdError,
} from '@/lib/ldap';

const schema = z.object({
  username: z.string().min(1, '请输入工号'),
  password: z.string().min(1, '请输入密码'),
  domain: z.string().min(1).default(DEFAULT_AD_DOMAIN),
});

/**
 * POST /api/auth/ad-login — 後台 AD 登入（PRD F2-8）
 *
 * 流程：AD 驗證帳密 → 查詢是否已綁定後台帳號 → 簽發管理員 Token。
 * 未綁定者即使 AD 驗證成功也不得進入後台，權限由系統管理員於帳號管理指派。
 */
export async function POST(request: Request) {
  try {
    if (!isAdAuthAvailable()) {
      return NextResponse.json(
        { success: false, error: 'AD 登入未配置，请改用管理员账号登入' },
        { status: 503 }
      );
    }

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { username, password, domain } = parsed.data;

    if (!AD_DOMAINS.some((d) => d.code === domain)) {
      return NextResponse.json({ success: false, error: '组织代码不正确' }, { status: 400 });
    }

    // ① AD 帳密驗證
    const adUser = await authenticateAdUser(username, password, domain);
    if (!adUser) {
      return NextResponse.json(
        { success: false, error: '工号或密码错误' },
        { status: 401 }
      );
    }

    // ② 必須事先綁定後台帳號（不自動建立，避免任何 AD 使用者都能進後台）
    const admin = await prisma.admin.findFirst({
      where: {
        authSource: 'AD',
        adDomain: domain,
        adUsername: { equals: adUser.username },
      },
      include: { processScopes: { select: { process: true } } },
    });

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          error: `AD 验证成功，但此账号尚未获授权使用后台（${adUser.displayName}）。请联系系统管理员绑定并指派工序。`,
        },
        { status: 403 }
      );
    }

    if (!admin.isActive) {
      return NextResponse.json({ success: false, error: '账号已停用' }, { status: 403 });
    }

    // ③ 簽發後台 Token
    const token = await createAdminToken({
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
    });

    const cookieStore = await cookies();
    cookieStore.set('admin_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });

    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
        adUser: { username: adUser.username, displayName: adUser.displayName, domain },
        processes: admin.processScopes.map((s) => s.process),
      },
    });
  } catch (error) {
    if (error instanceof AdError) {
      console.error('AD login error:', error.message);
      return NextResponse.json(
        { success: false, error: `AD 服务异常：${error.message}` },
        { status: 502 }
      );
    }
    console.error('AD login error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
