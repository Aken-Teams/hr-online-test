import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { z } from 'zod';

const updateEmployeeSchema = z.object({
  faceDescriptor: z.array(z.number()).length(128).optional(),
});

/**
 * PATCH /api/admin/employees/[id]
 * Update employee fields (currently supports faceDescriptor).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.faceDescriptor) {
      data.faceDescriptor = parsed.data.faceDescriptor;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: '没有需要更新的数据' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update employee error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
