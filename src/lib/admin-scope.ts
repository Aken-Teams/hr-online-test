/**
 * 後台權限範圍（PRD F2）
 *
 * - SUPER_ADMIN / HR：可見全部工序
 * - GRADER：僅能查詢與批改所指派工序的考生試卷
 *
 * 工序來源為 ExamAssignment.process；舊資料若未綁定 assignment，
 * 退而使用 User.role（系統既有欄位同樣存放工序代碼）。
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AdminTokenPayload } from '@/lib/auth';

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: '系统管理员',
  HR: '人资',
  GRADER: '评卷人',
};

/** 是否為受工序限制的角色 */
export function isScopedRole(role: string | undefined): boolean {
  return role === 'GRADER';
}

/** 是否可管理後台帳號（僅系統管理員） */
export function canManageAccounts(role: string | undefined): boolean {
  return role === 'SUPER_ADMIN';
}

/** 是否可使用閱卷以外的管理功能（題庫、考試、員工、報表） */
export function canManageExamData(role: string | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'HR';
}

export interface AdminScopeInfo {
  adminId: string;
  role: string;
  /** null = 不受限制（可見全部工序） */
  processes: string[] | null;
}

/** 取得該管理員的工序範圍；非 GRADER 回傳 null 代表不受限 */
export async function getAdminScope(admin: AdminTokenPayload): Promise<AdminScopeInfo> {
  if (!isScopedRole(admin.role)) {
    return { adminId: admin.adminId, role: admin.role, processes: null };
  }

  const scopes = await prisma.adminScope.findMany({
    where: { adminId: admin.adminId },
    select: { process: true },
  });

  return {
    adminId: admin.adminId,
    role: admin.role,
    processes: scopes.map((s) => s.process),
  };
}

/**
 * 產生 ExamSession 的工序過濾條件。
 *
 * - 不受限時回傳 {}（不加任何限制）
 * - 受限且未指派任何工序時回傳不可能成立的條件，確保看不到任何試卷
 */
export function buildSessionScopeFilter(
  scope: AdminScopeInfo
): Prisma.ExamSessionWhereInput {
  if (scope.processes === null) return {};
  if (scope.processes.length === 0) return { id: { in: [] } };

  return {
    OR: [
      { assignment: { process: { in: scope.processes } } },
      // 舊資料無 assignment 時以考生本身的工序（users.role）判定
      { assignment: null, user: { role: { in: scope.processes } } },
    ],
  };
}

/** 檢查某個 session 是否落在權限範圍內（單筆存取用） */
export async function canAccessSession(
  scope: AdminScopeInfo,
  sessionId: string
): Promise<boolean> {
  if (scope.processes === null) return true;
  if (scope.processes.length === 0) return false;

  const found = await prisma.examSession.findFirst({
    where: { id: sessionId, ...buildSessionScopeFilter(scope) },
    select: { id: true },
  });
  return found !== null;
}

/**
 * 供評卷人指派用的工序清單。
 *
 * 依「題庫中有簡答題的工序」呈現——評卷人只批改簡答題，沒有簡答題庫的
 * 工序不需要指派評卷人。這也自動排除了誤填成人名的髒資料（那些 process
 * 下沒有任何簡答題）。
 */
export async function listKnownProcesses(): Promise<string[]> {
  const processes = await prisma.question.findMany({
    where: { type: 'SHORT_ANSWER', process: { not: null } },
    select: { process: true },
    distinct: ['process'],
  });

  const set = new Set<string>();
  for (const q of processes) if (q.process) set.add(q.process);

  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}
