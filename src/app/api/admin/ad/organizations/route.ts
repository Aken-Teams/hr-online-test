import { NextResponse } from 'next/server';
import { getAdminFromCookie } from '@/lib/auth';
import { canManageExamData } from '@/lib/admin-scope';
import {
  listOrganizationUnits,
  isAdConfigured,
  AD_DOMAINS,
  DEFAULT_AD_DOMAIN,
  AdError,
} from '@/lib/ldap';

/**
 * GET /api/admin/ad/organizations — 組織架構樹（含各單位成員）
 * 資料量較大，由瀏覽器端自行快取；此處僅做權限控管與欄位整理。
 */
export async function GET(request: Request) {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
  }
  if (!canManageExamData(admin.role)) {
    return NextResponse.json({ success: false, error: '无权限查看组织信息' }, { status: 403 });
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
    const units = await listOrganizationUnits(domain);
    const withMembers = units.filter((u) => u.memberCount > 0);
    return NextResponse.json({
      success: true,
      data: {
        domain,
        domains: AD_DOMAINS,
        totalUnits: units.length,
        totalMembers: withMembers.reduce((sum, u) => sum + u.memberCount, 0),
        units: withMembers,
      },
    });
  } catch (error) {
    const status = error instanceof AdError ? (error.status ?? 502) : 502;
    console.error('AD organization query error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status });
  }
}
