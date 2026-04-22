import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { questionCreateSchema } from '@/lib/validators';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import type { QuestionType } from '@prisma/client';

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
    const type = searchParams.get('type') as QuestionType | null;
    const department = searchParams.get('department');
    const level = searchParams.get('level');
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');
    const examSourceId = searchParams.get('examSourceId');
    const process = searchParams.get('process');
    const category = searchParams.get('category');

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    }
    if (department) {
      where.department = department;
    }
    if (level) {
      where.level = level;
    }
    if (isActive !== null && isActive !== '') {
      where.isActive = isActive === 'true';
    }
    if (search) {
      where.content = { contains: search };
    }
    if (examSourceId) {
      where.examSourceId = examSourceId;
    }
    if (process) {
      where.process = process;
    }
    if (category) {
      where.category = category;
    }

    const [items, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: {
          options: { orderBy: { sortOrder: 'asc' } },
          tags: { select: { tag: true } },
          examSource: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.question.count({ where }),
    ]);

    const questions = items.map((q) => ({
      id: q.id,
      type: q.type,
      content: q.content,
      level: q.level,
      department: q.department,
      subDepartment: q.subDepartment,
      role: q.role,
      points: q.points,
      difficulty: q.difficulty,
      correctAnswer: q.correctAnswer,
      isMultiSelect: q.isMultiSelect,
      referenceAnswer: q.referenceAnswer,
      gradingRubric: q.gradingRubric,
      sourceFile: q.sourceFile,
      isActive: q.isActive,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        content: o.content,
        imageUrl: o.imageUrl ?? null,
        sortOrder: o.sortOrder,
      })),
      tags: q.tags.map((t) => t.tag),
      examSourceId: q.examSourceId,
      examSourceTitle: q.examSource?.title ?? null,
      createdAt: q.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        items: questions,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('List questions error:', error);
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
    const parsed = questionCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const question = await prisma.$transaction(async (tx) => {
      const newQuestion = await tx.question.create({
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
                  imageUrl: opt.imageUrl ?? null,
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
          action: 'QUESTION_CREATED',
          details: { questionId: newQuestion.id, type: newQuestion.type },
        },
      });

      return newQuestion;
    });

    return NextResponse.json(
      { success: true, data: question },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create question error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
