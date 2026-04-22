import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

export async function POST(
  _request: Request,
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

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        questionRules: true,
        assignments: true,
      },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    // Can only publish from DRAFT or transition PUBLISHED -> ACTIVE
    const validTransitions: Record<string, string> = {
      DRAFT: 'PUBLISHED',
      PUBLISHED: 'ACTIVE',
    };

    const newStatus = validTransitions[exam.status];
    if (!newStatus) {
      return NextResponse.json(
        { success: false, error: `当前状态 "${exam.status}" 不允许发布操作` },
        { status: 403 }
      );
    }

    // Validate exam has question rules
    if (exam.questionRules.length === 0) {
      return NextResponse.json(
        { success: false, error: '考试至少需要一条出题规则才能发布' },
        { status: 400 }
      );
    }

    // Validate exam has assignments
    if (exam.assignments.length === 0) {
      return NextResponse.json(
        { success: false, error: '考试至少需要一条分配规则才能发布' },
        { status: 400 }
      );
    }

    // Only one exam can be ACTIVE at a time
    if (newStatus === 'ACTIVE') {
      const activeExam = await prisma.exam.findFirst({
        where: { status: 'ACTIVE', id: { not: id } },
        select: { id: true, title: true },
      });
      if (activeExam) {
        return NextResponse.json(
          {
            success: false,
            error: `已有考试「${activeExam.title}」正在进行中，请先结束该考试后再开放新考试`,
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.exam.update({
        where: { id },
        data: { status: newStatus as 'PUBLISHED' | 'ACTIVE' },
      });

      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'EXAM_PUBLISHED',
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
      data: {
        id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error('Publish exam error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
