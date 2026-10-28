import { NextResponse } from 'next/server';
import { getAdminFromCookie } from '@/lib/auth';
import { canManageAccounts } from '@/lib/admin-scope';
import {
  searchAdUsers,
  getAdUser,
  isAdConfigured,
  AD_DOMAINS,
  DEFAULT_AD_DOMAIN,
  AdError,
} from '@/lib/ldap';

/**
 * GET /api/admin/ad/users — AD 人員查詢（後台代理，金鑰不外流）
 *   ?q=王小明&domain=PJXZ   姓名模糊查詢（至少 2 字）
 *   ?username=p210017       以工號查單一使用者
 */
export async function GET(request: Request) {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
  }
  if (!canManageAccounts(admin.role)) {
    return NextResponse.json({ success: false, error: '仅系统管理员可查询 AD' }, { status: 403 });
  }
  if (!isAdConfigured()) {
    return NextResponse.json(
      { success: false, error: 'AD 查询未配置（缺少 AD_API）' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain') || DEFAULT_AD_DOMAIN;
  if (!AD_DOMAINS.some((d) => d.code === domain)) {
    return NextResponse.json({ success: false, error: '组织代码不正确' }, { status: 400 });
  }

  try {
    const username = searchParams.get('username');
    if (username) {
      const user = await getAdUser(username, domain);
      return NextResponse.json({ success: true, data: { user } });
    }

    const q = (searchParams.get('q') || '').trim();
    if (q.length < 2) {
      return NextResponse.json(
        { success: false, error: '姓名关键字至少 2 个字' },
        { status: 400 }
      );
    }

    const result = await searchAdUsers(q, domain, Number(searchParams.get('limit') || 20));
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const status = error instanceof AdError ? (error.status ?? 502) : 502;
    console.error('AD user query error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
