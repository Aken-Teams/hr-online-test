import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { examCreateSchema } from '@/lib/validators';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import type { ExamStatus } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)));
    const status = searchParams.get('status') as ExamStatus | null;
    const search = searchParams.get('search') || '';

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.title = { contains: search };
    }

    const [items, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        include: {
          questionRules: true,
          _count: {
            select: {
              sessions: true,
              assignments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.exam.count({ where }),
    ]);

    const now = new Date();
    const exams = items.map((exam) => {
      // Compute display status based on time window for PUBLISHED/ACTIVE exams
      let displayStatus = exam.status as string;
      if (exam.status === 'PUBLISHED' || exam.status === 'ACTIVE') {
        if (exam.openAt && now < exam.openAt) {
          displayStatus = 'NOT_STARTED';
        } else if (exam.closeAt && now > exam.closeAt) {
          displayStatus = 'EXPIRED';
        } else {
          displayStatus = 'ACTIVE';
        }
      }

      return {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        timeLimitMinutes: exam.timeLimitMinutes,
        passScore: exam.passScore,
        totalScore: exam.totalScore,
        status: exam.status,
        displayStatus,
        openAt: exam.openAt,
        closeAt: exam.closeAt,
        maxAttempts: exam.maxAttempts,
        questionCount: exam.questionRules.length,
        sessionCount: exam._count.sessions,
        createdAt: exam.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        items: exams,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('List exams error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
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

    // Extract assignments if present in the body
    const assignments: { userId?: string; department?: string; role?: string }[] =
      body.assignments || [];

    const exam = await prisma.$transaction(async (tx) => {
      const newExam = await tx.exam.create({
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
          status: 'DRAFT',
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

      // Create assignments
      if (assignments.length > 0) {
        await tx.examAssignment.createMany({
          data: assignments.map((a) => ({
            examId: newExam.id,
            userId: a.userId ?? null,
            department: a.department ?? null,
            role: a.role ?? null,
          })),
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'EXAM_CREATED',
          details: { examId: newExam.id, title: newExam.title },
        },
      });

      return newExam;
    });

    return NextResponse.json(
      {
        success: true,
        data: exam,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create exam error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
