import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * 後台角色權限控管（PRD F2-4）
 *
 * 評卷人（GRADER）只開放閱卷相關頁面與 API；員工管理、題庫管理、
 * 成績匯出、監考、帳號管理等一律擋在後端，不能靠隱藏選單繞過。
 *
 * 僅驗證 JWT 與路徑白名單（Edge runtime 不能用 Prisma）；
 * 工序層級的資料隔離在各 API 內以 admin-scope 處理。
 */

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');

/** 評卷人可存取的 API（前綴比對，另依 HTTP method 限制） */
const GRADER_API_RULES: { prefix: string; methods: string[] }[] = [
  // AD 人員查詢／組織樹僅限人資與系統管理員，評卷人不開放

  { prefix: '/api/admin/grading', methods: ['GET', 'POST'] },
  // 閱卷頁需要考試清單與基本資訊，唯讀即可
  { prefix: '/api/admin/exams', methods: ['GET'] },
  { prefix: '/api/admin/results', methods: ['GET'] },
];

function isGraderApiAllowed(pathname: string, method: string): boolean {
  return GRADER_API_RULES.some(
    (rule) => pathname.startsWith(rule.prefix) && rule.methods.includes(method)
  );
}

function isGraderPageAllowed(pathname: string): boolean {
  if (pathname === '/admin/login') return true;
  // 评卷人门户
  if (pathname === '/admin/grading' || pathname.startsWith('/admin/grading/')) return true;
  // 考試詳情頁僅開放閱卷子頁（不開放列表 /admin/exams 與编辑页）
  if (/^\/admin\/exams\/[^/]+\/grading/.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('admin_token')?.value;

  if (!token) return NextResponse.next();

  let role: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret);
    role = typeof payload.role === 'string' ? payload.role : undefined;
  } catch {
    return NextResponse.next(); // token 無效 → 交由各頁面／API 的既有驗證處理
  }

  if (role !== 'GRADER') return NextResponse.next();

  if (pathname.startsWith('/api/admin/')) {
    if (isGraderApiAllowed(pathname, request.method)) return NextResponse.next();
    return NextResponse.json(
      { success: false, error: '评卷人仅能使用阅卷功能' },
      { status: 403 }
    );
  }

  if (pathname.startsWith('/admin')) {
    if (isGraderPageAllowed(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL('/admin/grading', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
