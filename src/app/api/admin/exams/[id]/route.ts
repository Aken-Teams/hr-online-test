import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { examCreateSchema } from '@/lib/validators';
import { syncExamStatuses } from '@/lib/exam-status-sync';

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

    // Auto-sync exam statuses based on openAt/closeAt
    await syncExamStatuses();

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
        batches: {
          select: { id: true, name: true, openAt: true, closeAt: true },
          orderBy: { openAt: 'asc' as const },
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

    if (existing.status === 'ARCHIVED') {
      return NextResponse.json(
        { success: false, error: '归档的考试无法修改' },
        { status: 403 }
      );
    }

    const isFullyEditable = ['DRAFT', 'PUBLISHED'].includes(existing.status);

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
      if (isFullyEditable) {
        // DRAFT / PUBLISHED — full edit including question rules & assignments
        await tx.examQuestionRule.deleteMany({ where: { examId: id } });

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
            theoryWeight: data.theoryWeight,
            practicalWeight: data.practicalWeight,
            compositePassScore: data.compositePassScore,
            basicQuestionRatio: data.basicQuestionRatio,
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

        // Note: assignments are now managed via the participants API,
        // but we still sync if explicitly provided in the request body
        if ('assignments' in body) {
          await tx.examAssignment.deleteMany({ where: { examId: id } });
          if (assignments.length > 0) {
            await tx.examAssignment.createMany({
              data: assignments.map((a) => ({
                examId: id,
                userId: a.userId ?? null,
                department: a.department ?? null,
                role: a.role ?? null,
              })),
            });
          }
        }

        // Batches: delete-all + re-create (simple overwrite)
        if ('batches' in body) {
          await tx.examBatch.deleteMany({ where: { examId: id } });
          const batches: { name: string; openAt: string; closeAt: string }[] =
            body.batches || [];
          if (batches.length > 0) {
            const examOpen = data.openAt ? new Date(data.openAt) : null;
            const examClose = data.closeAt ? new Date(data.closeAt) : null;
            for (const b of batches) {
              const bOpen = new Date(b.openAt);
              const bClose = new Date(b.closeAt);
              if (examOpen && bOpen < examOpen) {
                throw new Error(`梯次「${b.name}」的开始时间不能早于考试开放时间`);
              }
              if (examClose && bClose > examClose) {
                throw new Error(`梯次「${b.name}」的结束时间不能晚于考试截止时间`);
              }
              if (bOpen >= bClose) {
                throw new Error(`梯次「${b.name}」的开始时间必须早于结束时间`);
              }
            }
            await tx.examBatch.createMany({
              data: batches.map((b) => ({
                examId: id,
                name: b.name,
                openAt: new Date(b.openAt),
                closeAt: new Date(b.closeAt),
              })),
            });
          }
        }

        return { exam: updated, restricted: false };
      }

      // ACTIVE / CLOSED — only basic info, NOT question rules & assignments
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
          theoryWeight: data.theoryWeight,
          practicalWeight: data.practicalWeight,
          compositePassScore: data.compositePassScore,
          basicQuestionRatio: data.basicQuestionRatio,
        },
        include: { questionRules: true },
      });

      // Batches: keep started batches intact; allow updating/adding future batches
      if ('batches' in body) {
        const incomingBatches: { name: string; openAt: string; closeAt: string }[] =
          body.batches || [];
        const now = new Date();
        const existingBatches = await tx.examBatch.findMany({
          where: { examId: id },
          select: { id: true, name: true, openAt: true },
        });
        const existingByName = new Map(existingBatches.map((b) => [b.name, b]));
        const examOpen = data.openAt ? new Date(data.openAt) : null;
        const examClose = data.closeAt ? new Date(data.closeAt) : null;

        for (const b of incomingBatches) {
          const bOpen = new Date(b.openAt);
          const bClose = new Date(b.closeAt);
          // For active exams only enforce the exam's closeAt (not openAt, to allow earlier batch times)
          if (examClose && bClose > examClose) throw new Error(`梯次「${b.name}」的结束时间不能晚于考试截止时间`);
          if (bOpen >= bClose) throw new Error(`梯次「${b.name}」的开始时间必须早于结束时间`);

          const existing = existingByName.get(b.name);
          if (existing) {
            // Only update if this batch hasn't started yet
            if (existing.openAt > now) {
              await tx.examBatch.update({
                where: { id: existing.id },
                data: { openAt: bOpen, closeAt: bClose },
              });
            }
          } else {
            // New batch — create it
            await tx.examBatch.create({
              data: { examId: id, name: b.name, openAt: bOpen, closeAt: bClose },
            });
          }
        }
      }

      return { exam: updated, restricted: true };
    });

    const message = exam.restricted
      ? '已保存基本信息（题目规则和指派范围已锁定，未修改）'
      : '考试已保存';

    return NextResponse.json({
      success: true,
      data: exam.exam,
      restricted: exam.restricted,
      message,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('梯次')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
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

    // Only DRAFT and PUBLISHED exams can be deleted
    if (!['DRAFT', 'PUBLISHED'].includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: '仅草稿或待开放的考试可以删除' },
        { status: 403 }
      );
    }

    // Cascade delete: sessions (and their answers/results) first, then exam
    if (existing._count.sessions > 0) {
      const sessions = await prisma.examSession.findMany({
        where: { examId: id },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);

      await prisma.$transaction([
        prisma.auditLog.deleteMany({ where: { sessionId: { in: sessionIds } } }),
        prisma.examSession.deleteMany({ where: { examId: id } }),
        prisma.exam.delete({ where: { id } }),
      ]);
    } else {
      await prisma.exam.delete({ where: { id } });
    }

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
