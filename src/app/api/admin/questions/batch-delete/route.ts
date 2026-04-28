import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * POST /api/admin/questions/batch-delete
 * Delete multiple questions at once.
 * Questions in use by exams are soft-deleted (isActive = false).
 */
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
    const ids: string[] = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要删除的题目' },
        { status: 400 }
      );
    }

    // Load questions with exam usage count
    const questions = await prisma.question.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        _count: { select: { examQuestions: true } },
      },
    });

    const toDelete: string[] = [];
    const toDeactivate: string[] = [];

    for (const q of questions) {
      if (q._count.examQuestions > 0) {
        toDeactivate.push(q.id);
      } else {
        toDelete.push(q.id);
      }
    }

    await prisma.$transaction(async (tx) => {
      // Soft-delete questions in use
      if (toDeactivate.length > 0) {
        await tx.question.updateMany({
          where: { id: { in: toDeactivate } },
          data: { isActive: false },
        });
      }

      // Hard-delete unused questions (options cascade via schema)
      if (toDelete.length > 0) {
        await tx.questionOption.deleteMany({ where: { questionId: { in: toDelete } } });
        await tx.questionTag.deleteMany({ where: { questionId: { in: toDelete } } });
        await tx.question.deleteMany({ where: { id: { in: toDelete } } });
      }

      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'QUESTION_BATCH_DELETED',
          details: { deleted: toDelete.length, deactivated: toDeactivate.length },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        deleted: toDelete.length,
        deactivated: toDeactivate.length,
      },
    });
  } catch (error) {
    console.error('Batch delete questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
