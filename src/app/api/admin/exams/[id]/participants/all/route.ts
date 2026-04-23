import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * DELETE /api/admin/exams/[id]/participants/all
 * Delete all participants for a given exam (only those who haven't started).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: examId } = await params;

    // Find assignments that have no sessions (not started)
    const assignments = await prisma.examAssignment.findMany({
      where: { examId },
      include: {
        sessions: { select: { id: true }, take: 1 },
      },
    });

    const deletable = assignments.filter((a) => a.sessions.length === 0);

    if (deletable.length > 0) {
      await prisma.examAssignment.deleteMany({
        where: { id: { in: deletable.map((a) => a.id) } },
      });
    }

    const skipped = assignments.length - deletable.length;

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'QUESTION_DELETED',
        details: { type: 'participants', examId, deletedCount: deletable.length, skipped },
      },
    });

    return NextResponse.json({
      success: true,
      data: { deletedCount: deletable.length, skipped },
      message: skipped > 0
        ? `已删除 ${deletable.length} 人，${skipped} 人已参加考试无法删除`
        : `已删除 ${deletable.length} 人`,
    });
  } catch (error) {
    console.error('Delete all participants error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
