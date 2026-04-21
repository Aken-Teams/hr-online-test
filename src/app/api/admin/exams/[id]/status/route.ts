import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * Valid manual status transitions:
 *   DRAFT      → PUBLISHED
 *   PUBLISHED  → ACTIVE
 *   ACTIVE     → CLOSED
 *   CLOSED     → ACTIVE   (reopen)
 *   CLOSED     → ARCHIVED
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ACTIVE'],
  ACTIVE: ['CLOSED'],
  CLOSED: ['ACTIVE', 'ARCHIVED'],
};

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
    const { status: newStatus } = await request.json();

    if (!newStatus) {
      return NextResponse.json(
        { success: false, error: '请提供目标状态' },
        { status: 400 }
      );
    }

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: { questionRules: true, assignments: true },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    const allowed = VALID_TRANSITIONS[exam.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: `无法从「${exam.status}」转换到「${newStatus}」` },
        { status: 403 }
      );
    }

    // Validate before publishing
    if (newStatus === 'PUBLISHED' || newStatus === 'ACTIVE') {
      if (exam.questionRules.length === 0) {
        return NextResponse.json(
          { success: false, error: '考试至少需要一条出题规则' },
          { status: 400 }
        );
      }
      if (exam.assignments.length === 0) {
        return NextResponse.json(
          { success: false, error: '考试至少需要一条指派规则' },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.exam.update({
        where: { id },
        data: { status: newStatus },
      });

      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: newStatus === 'CLOSED' ? 'EXAM_CLOSED' : 'EXAM_PUBLISHED',
          details: {
            examId: id,
            title: exam.title,
            previousStatus: exam.status,
            newStatus,
          },
        },
      });

      return result;
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, status: updated.status },
    });
  } catch (error) {
    console.error('Change exam status error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
