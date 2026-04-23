import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionType } from '@prisma/client';

/**
 * GET /api/admin/exams/[id]/questions
 * Get question summary for an exam (count by type).
 */
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

    const { id: examId } = await params;

    const questions = await prisma.question.findMany({
      where: { examSourceId: examId },
      select: { type: true },
    });

    const byType: Record<string, number> = {};
    for (const q of questions) {
      const label = QUESTION_TYPE_LABELS[q.type as QuestionType] || q.type;
      byType[label] = (byType[label] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        total: questions.length,
        byType,
      },
    });
  } catch (error) {
    console.error('Get exam questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/exams/[id]/questions
 * Delete all questions imported for this exam.
 */
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

    const { id: examId } = await params;

    // Delete exam-question mappings first
    await prisma.examQuestion.deleteMany({ where: { examId } });

    // Delete options of questions tied to this exam
    const questionIds = await prisma.question.findMany({
      where: { examSourceId: examId },
      select: { id: true },
    });
    const ids = questionIds.map((q) => q.id);

    if (ids.length > 0) {
      await prisma.questionOption.deleteMany({
        where: { questionId: { in: ids } },
      });
      await prisma.question.deleteMany({
        where: { examSourceId: examId },
      });
    }

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'QUESTION_DELETED',
        details: { examId, deletedCount: ids.length },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete exam questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
