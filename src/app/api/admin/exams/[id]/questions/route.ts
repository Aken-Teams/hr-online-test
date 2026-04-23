import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionType } from '@prisma/client';

/**
 * GET /api/admin/exams/[id]/questions
 * Get question summary for an exam (count by type + by source file).
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
      select: { type: true, sourceFile: true, category: true, createdAt: true },
    });

    const byType: Record<string, number> = {};
    for (const q of questions) {
      const label = QUESTION_TYPE_LABELS[q.type as QuestionType] || q.type;
      byType[label] = (byType[label] || 0) + 1;
    }

    // Group by source file
    const fileMap = new Map<string, { count: number; category: string; byType: Record<string, number>; importedAt: Date }>();
    for (const q of questions) {
      const sf = q.sourceFile || '(未知来源)';
      let entry = fileMap.get(sf);
      if (!entry) {
        entry = { count: 0, category: q.category || 'PROFESSIONAL', byType: {}, importedAt: q.createdAt };
        fileMap.set(sf, entry);
      }
      entry.count++;
      const label = QUESTION_TYPE_LABELS[q.type as QuestionType] || q.type;
      entry.byType[label] = (entry.byType[label] || 0) + 1;
      if (q.createdAt > entry.importedAt) entry.importedAt = q.createdAt;
    }

    const byFile = Array.from(fileMap.entries()).map(([sourceFile, data]) => ({
      sourceFile,
      count: data.count,
      category: data.category,
      byType: data.byType,
      importedAt: data.importedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        total: questions.length,
        byType,
        byFile,
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
 * Delete questions imported for this exam.
 * Query params:
 *   ?sourceFile=xxx.xls  — delete only questions from this file
 *   (no param)           — delete ALL questions for this exam
 */
export async function DELETE(
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

    const { id: examId } = await params;
    const url = new URL(request.url);
    const sourceFile = url.searchParams.get('sourceFile');

    const where = sourceFile
      ? { examSourceId: examId, sourceFile }
      : { examSourceId: examId };

    // Find question IDs to delete
    const questionIds = await prisma.question.findMany({
      where,
      select: { id: true },
    });
    const ids = questionIds.map((q) => q.id);

    if (ids.length > 0) {
      // Delete exam-question mappings for these questions
      await prisma.examQuestion.deleteMany({
        where: { examId, questionId: { in: ids } },
      });
      // Delete options
      await prisma.questionOption.deleteMany({
        where: { questionId: { in: ids } },
      });
      // Delete questions
      await prisma.question.deleteMany({
        where: { id: { in: ids } },
      });
    }

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'QUESTION_DELETED',
        details: { examId, sourceFile: sourceFile || '(all)', deletedCount: ids.length },
      },
    });

    return NextResponse.json({ success: true, data: { deletedCount: ids.length } });
  } catch (error) {
    console.error('Delete exam questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
