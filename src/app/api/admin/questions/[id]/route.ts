import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { questionCreateSchema } from '@/lib/validators';

export async function GET(
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

    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        tags: { select: { tag: true } },
      },
    });

    if (!question) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...question,
        tags: question.tags.map((t) => t.tag),
      },
    });
  } catch (error) {
    console.error('Get question error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const existing = await prisma.question.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = questionCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const question = await prisma.$transaction(async (tx) => {
      // Delete old options and tags
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.questionTag.deleteMany({ where: { questionId: id } });

      const updated = await tx.question.update({
        where: { id },
        data: {
          type: data.type,
          content: data.content,
          level: data.level,
          department: data.department,
          subDepartment: data.subDepartment ?? null,
          role: data.role,
          points: data.points,
          difficulty: data.difficulty,
          correctAnswer: data.correctAnswer ?? null,
          isMultiSelect: data.isMultiSelect,
          referenceAnswer: data.referenceAnswer ?? null,
          gradingRubric: data.gradingRubric ?? null,
          options: data.options
            ? {
                create: data.options.map((opt, idx) => ({
                  label: opt.label,
                  content: opt.content,
                  sortOrder: opt.sortOrder ?? idx,
                })),
              }
            : undefined,
          tags: data.tags
            ? {
                create: data.tags.map((tag) => ({ tag })),
              }
            : undefined,
        },
        include: {
          options: { orderBy: { sortOrder: 'asc' } },
          tags: { select: { tag: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'QUESTION_UPDATED',
          details: { questionId: id, type: updated.type },
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: {
        ...question,
        tags: question.tags.map((t) => t.tag),
      },
    });
  } catch (error) {
    console.error('Update question error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const existing = await prisma.question.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { examQuestions: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      );
    }

    // If question is used in exams, soft-delete instead
    if (existing._count.examQuestions > 0) {
      await prisma.question.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        data: { deleted: false, deactivated: true, message: '题目已被考试引用，已设为停用' },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.question.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'QUESTION_DELETED',
          details: { questionId: id },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Delete question error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
