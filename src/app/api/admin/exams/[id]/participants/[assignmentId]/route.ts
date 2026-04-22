import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * DELETE /api/admin/exams/[id]/participants/[assignmentId]
 * Remove a single participant assignment.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: examId, assignmentId } = await params;

    // Verify assignment belongs to this exam
    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, examId },
      include: {
        sessions: { select: { id: true }, take: 1 },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '指派不存在' },
        { status: 404 }
      );
    }

    // Don't allow deletion if there are existing sessions
    if (assignment.sessions.length > 0) {
      return NextResponse.json(
        { success: false, error: '该人员已有考试记录，无法删除' },
        { status: 400 }
      );
    }

    await prisma.examAssignment.delete({
      where: { id: assignmentId },
    });

    return NextResponse.json({ success: true, message: '已删除' });
  } catch (error) {
    console.error('Delete participant error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
