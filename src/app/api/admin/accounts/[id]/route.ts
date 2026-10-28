import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie, hashPassword } from '@/lib/auth';
import { canManageAccounts } from '@/lib/admin-scope';

const updateSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  role: z.enum(['SUPER_ADMIN', 'HR', 'GRADER']).optional(),
  isActive: z.boolean().optional(),
  isShared: z.boolean().optional(),
  /** 重設密碼（未提供表示不變更） */
  password: z.string().min(6, '密码至少 6 个字符').max(72).optional(),
  mustChangePassword: z.boolean().optional(),
  /** 覆寫負責工序；未提供則不變更 */
  processes: z.array(z.string().min(1)).optional(),
});

/** PATCH /api/admin/accounts/[id] — 更新帳號、重設密碼、調整負責工序 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
  }
  if (!canManageAccounts(admin.role)) {
    return NextResponse.json({ success: false, error: '仅系统管理员可管理账号' }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.admin.findUnique({
    where: { id },
    include: { processScopes: true },
  });
  if (!target) {
    return NextResponse.json({ success: false, error: '账号不存在' }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // 不允許停用或降級自己，避免把最後一個管理員鎖在門外
  if (target.id === admin.adminId) {
    if (data.isActive === false) {
      return NextResponse.json({ success: false, error: '不能停用自己的账号' }, { status: 400 });
    }
    if (data.role && data.role !== target.role) {
      return NextResponse.json({ success: false, error: '不能变更自己的角色' }, { status: 400 });
    }
  }

  const losingSuperAdmin =
    target.role === 'SUPER_ADMIN' &&
    (data.isActive === false || (data.role !== undefined && data.role !== 'SUPER_ADMIN'));

  if (losingSuperAdmin) {
    const remaining = await prisma.admin.count({
      where: { role: 'SUPER_ADMIN', isActive: true, NOT: { id: target.id } },
    });
    if (remaining === 0) {
      return NextResponse.json(
        { success: false, error: '至少需保留一个启用的系统管理员' },
        { status: 400 }
      );
    }
  }

  const passwordHash = data.password ? await hashPassword(data.password) : null;

  await prisma.$transaction(async (tx) => {
    await tx.admin.update({
      where: { id },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.isShared !== undefined ? { isShared: data.isShared } : {}),
        ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
        ...(data.mustChangePassword !== undefined && !passwordHash
          ? { mustChangePassword: data.mustChangePassword }
          : {}),
      },
    });

    if (data.processes) {
      await tx.adminScope.deleteMany({ where: { adminId: id } });
      if (data.processes.length > 0) {
        await tx.adminScope.createMany({
          data: data.processes.map((process) => ({ adminId: id, process })),
          skipDuplicates: true,
        });
      }
      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'ADMIN_SCOPE_CHANGED',
          details: {
            targetId: id,
            username: target.username,
            before: target.processScopes.map((s) => s.process),
            after: data.processes,
          },
        },
      });
    }

    await tx.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: passwordHash
          ? 'ADMIN_PASSWORD_RESET'
          : data.isActive === false
            ? 'ADMIN_DEACTIVATED'
            : 'ADMIN_UPDATED',
        details: {
          targetId: id,
          username: target.username,
          changes: Object.keys(data).filter((k) => k !== 'password'),
        },
      },
    });
  });

  return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Update account error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}

/** DELETE /api/admin/accounts/[id] — 停用帳號（保留評分紀錄，不實體刪除） */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
  }
  if (!canManageAccounts(admin.role)) {
    return NextResponse.json({ success: false, error: '仅系统管理员可管理账号' }, { status: 403 });
  }

  const { id } = await params;
  if (id === admin.adminId) {
    return NextResponse.json({ success: false, error: '不能停用自己的账号' }, { status: 400 });
  }

  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ success: false, error: '账号不存在' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.admin.update({ where: { id }, data: { isActive: false } }),
    prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'ADMIN_DEACTIVATED',
        details: { targetId: id, username: target.username },
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Deactivate account error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
