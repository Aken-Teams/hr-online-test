import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * PATCH /api/admin/employees/[id]/assignments/[assignmentId]
 * Update an exam assignment's process and level.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { id: userId, assignmentId } = await params;
    const body = await request.json();

    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, userId },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '指派记录不存在' },
        { status: 404 }
      );
    }

    const data: Record<string, string> = {};
    if (body.process !== undefined) data.process = body.process;
    if (body.level !== undefined) data.level = body.level;
    if (body.department !== undefined) data.department = body.department;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: '没有需要更新的数据' },
        { status: 400 }
      );
    }

    const updated = await prisma.examAssignment.update({
      where: { id: assignmentId },
      data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update assignment error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
