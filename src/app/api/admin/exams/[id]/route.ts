import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { examCreateSchema } from '@/lib/validators';

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

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        questionRules: true,
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, employeeNo: true, department: true, role: true },
            },
          },
        },
        _count: {
          select: {
            sessions: true,
            examQuestions: true,
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: exam,
    });
  } catch (error) {
    console.error('Get exam error:', error);
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

    const existing = await prisma.exam.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    // Only DRAFT exams can be fully edited
    if (!['DRAFT', 'PUBLISHED'].includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: '当前考试状态不允许编辑' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = examCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const assignments: { userId?: string; department?: string; role?: string }[] =
      body.assignments || [];

    const exam = await prisma.$transaction(async (tx) => {
      // Delete old question rules
      await tx.examQuestionRule.deleteMany({ where: { examId: id } });

      // Update exam
      const updated = await tx.exam.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description ?? null,
          timeLimitMinutes: data.timeLimitMinutes,
          passScore: data.passScore,
          totalScore: data.totalScore,
          isPracticeMode: data.isPracticeMode,
          shuffleQuestions: data.shuffleQuestions,
          shuffleOptions: data.shuffleOptions,
          maxAttempts: data.maxAttempts,
          showResultImmediately: data.showResultImmediately,
          showCorrectAnswers: data.showCorrectAnswers,
          openAt: data.openAt ? new Date(data.openAt) : null,
          closeAt: data.closeAt ? new Date(data.closeAt) : null,
          resultQueryOpenAt: data.resultQueryOpenAt ? new Date(data.resultQueryOpenAt) : null,
          resultQueryCloseAt: data.resultQueryCloseAt ? new Date(data.resultQueryCloseAt) : null,
          tabSwitchLimit: data.tabSwitchLimit,
          enableFaceAuth: data.enableFaceAuth,
          questionRules: {
            create: data.questionRules.map((rule) => ({
              questionType: rule.questionType,
              count: rule.count,
              pointsPerQuestion: rule.pointsPerQuestion,
              department: rule.department ?? null,
              level: rule.level ?? null,
              commonRatio: rule.commonRatio,
            })),
          },
        },
        include: { questionRules: true },
      });

      // Recreate assignments if provided
      if (assignments.length > 0) {
        await tx.examAssignment.deleteMany({ where: { examId: id } });
        await tx.examAssignment.createMany({
          data: assignments.map((a) => ({
            examId: id,
            userId: a.userId ?? null,
            department: a.department ?? null,
            role: a.role ?? null,
          })),
        });
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: exam,
    });
  } catch (error) {
    console.error('Update exam error:', error);
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

    const existing = await prisma.exam.findUnique({
      where: { id },
      select: { status: true, _count: { select: { sessions: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    // Prevent deleting exams with sessions
    if (existing._count.sessions > 0) {
      return NextResponse.json(
        { success: false, error: '该考试已有考生作答记录，无法删除' },
        { status: 403 }
      );
    }

    await prisma.exam.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Delete exam error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
