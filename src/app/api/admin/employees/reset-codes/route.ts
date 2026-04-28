import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie, isBcryptHash } from '@/lib/auth';
import type { AuditAction } from '@prisma/client';

/**
 * POST /api/admin/employees/reset-codes
 * Clears all legacy bcrypt-hashed verification codes (idCardLast6) to null.
 * These codes are one-way hashed and cannot be recovered — clearing them
 * allows admins to re-import participants with fresh AES-encrypted codes.
 */
export async function POST() {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    // Find all users with non-null idCardLast6
    const users = await prisma.user.findMany({
      where: { idCardLast6: { not: null } },
      select: { id: true, idCardLast6: true },
    });

    // Filter to only bcrypt-hashed entries
    const bcryptUserIds = users
      .filter((u) => u.idCardLast6 && isBcryptHash(u.idCardLast6))
      .map((u) => u.id);

    if (bcryptUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cleared: 0 },
        message: '没有需要清除的旧格式验证码',
      });
    }

    await prisma.user.updateMany({
      where: { id: { in: bcryptUserIds } },
      data: { idCardLast6: null },
    });

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'BATCH_RESET_CODES' as AuditAction,
        details: { clearedCount: bcryptUserIds.length },
      },
    });

    return NextResponse.json({
      success: true,
      data: { cleared: bcryptUserIds.length },
      message: `已清除 ${bcryptUserIds.length} 个旧格式验证码`,
    });
  } catch (error) {
    console.error('Reset codes error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
