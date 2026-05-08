import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * PATCH /api/admin/exams/[id]/participants/[assignmentId]
 * Re-assign participant to a different batch (or clear batch assignment).
 *
 * Rules:
 * - Cannot change if participant has a completed/submitted session.
 * - Cannot change if current batch is still active (not yet expired).
 * - Can change if: no batch set, OR batch has expired AND participant didn't take the exam.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: examId, assignmentId } = await params;
    const body = await request.json();
    const newBatchId: string | null = body.batchId ?? null;

    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, examId },
      include: {
        batch: { select: { id: true, name: true, closeAt: true } },
        sessions: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ success: false, error: '指派不存在' }, { status: 404 });
    }

    const latestSession = assignment.sessions[0];
    const completedStatuses = ['COMPLETED', 'SUBMITTED', 'AUTO_SUBMITTED'];

    // Cannot change if already took exam
    if (latestSession && completedStatuses.includes(latestSession.status)) {
      return NextResponse.json(
        { success: false, error: '该人员已完成考试，无法调整梯次' },
        { status: 400 }
      );
    }

    // Cannot change if current batch is still active
    const now = new Date();
    if (assignment.batch && assignment.batch.closeAt > now) {
      return NextResponse.json(
        { success: false, error: `当前梯次「${assignment.batch.name}」尚未结束，请等待梯次过期后再调整` },
        { status: 400 }
      );
    }

    // Validate new batchId belongs to this exam (if provided)
    if (newBatchId) {
      const targetBatch = await prisma.examBatch.findFirst({
        where: { id: newBatchId, examId },
      });
      if (!targetBatch) {
        return NextResponse.json({ success: false, error: '梯次不存在' }, { status: 404 });
      }
    }

    const oldBatchId = assignment.batchId;
    const oldBatchName = assignment.batch?.name ?? null;

    // Fetch new batch name for audit log
    let newBatchName: string | null = null;
    if (newBatchId) {
      const nb = await prisma.examBatch.findUnique({ where: { id: newBatchId }, select: { name: true } });
      newBatchName = nb?.name ?? null;
    }

    await prisma.$transaction([
      prisma.examAssignment.update({
        where: { id: assignmentId },
        data: {
          batchId: newBatchId,
          previousBatchId: oldBatchId ?? assignment.previousBatchId, // keep earliest original if moved multiple times
        },
      }),
      prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'BATCH_REASSIGNED',
          details: {
            assignmentId,
            userId: assignment.userId,
            examId,
            fromBatchId: oldBatchId,
            fromBatchName: oldBatchName,
            toBatchId: newBatchId,
            toBatchName: newBatchName,
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: newBatchId
        ? `已调整至「${newBatchName}」`
        : '已清除梯次分配',
    });
  } catch (error) {
    console.error('Patch participant batch error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/exams/[id]/participants/[assignmentId]
 * Remove a single participant assignment.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: examId, assignmentId } = await params;

    // Verify assignment belongs to this exam
    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, examId },
      include: {
        sessions: { select: { id: true }, take: 1 },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '指派不存在' },
        { status: 404 }
      );
    }

    // Don't allow deletion if there are existing sessions
    if (assignment.sessions.length > 0) {
      return NextResponse.json(
        { success: false, error: '该人员已有考试记录，无法删除' },
        { status: 400 }
      );
    }

    await prisma.examAssignment.delete({
      where: { id: assignmentId },
    });

    return NextResponse.json({ success: true, message: '已删除' });
  } catch (error) {
    console.error('Delete participant error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
