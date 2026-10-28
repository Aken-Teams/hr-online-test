import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import type { QuestionType } from '@prisma/client';

/**
 * GET /api/admin/exams/[id]/pool-questions?process=&level=&type=
 *
 * 返回某工序/级别/题型「会从哪些题里抽」的实际题目列表（内容），
 * 与抽题引擎一致：上传型考试 = 本场独有 + 关联中央；非上传型 = 中央题库。
 * 池 = 基本题(全公司共用) + 专业题(该工序+级别)。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    const { id: examId } = await params;
    const { searchParams } = new URL(request.url);
    const process = searchParams.get('process') || undefined;
    const level = searchParams.get('level') || undefined;
    const type = searchParams.get('type') as QuestionType | null;
    if (!type) {
      return NextResponse.json({ success: false, error: '缺少题型' }, { status: 400 });
    }

    // 上传型考试检测（与 preview / generator 一致）
    const [exclusiveCount, links] = await Promise.all([
      prisma.question.count({ where: { examSourceId: examId } }),
      prisma.examSourceQuestion.findMany({ where: { examId }, select: { questionId: true } }),
    ]);
    const linkedCentralIds = links.map((l) => l.questionId);
    const hasUpload = exclusiveCount > 0 || linkedCentralIds.length > 0;
    const sourceWhere: Record<string, unknown> = hasUpload
      ? { OR: linkedCentralIds.length > 0 ? [{ examSourceId: examId }, { id: { in: linkedCentralIds } }] : [{ examSourceId: examId }] }
      : { examSourceId: null };

    const questions = await prisma.question.findMany({
      where: {
        isActive: true,
        type,
        AND: [
          sourceWhere,
          { OR: [{ category: 'BASIC' }, { category: 'PROFESSIONAL', process, level }] },
        ],
      },
      select: { id: true, content: true, category: true, process: true, level: true },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });

    return NextResponse.json({
      success: true,
      data: {
        hasUpload,
        total: questions.length,
        truncated: questions.length >= 500,
        questions,
      },
    });
  } catch (error) {
    console.error('Pool questions error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
