import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

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

    const sessions = await prisma.examSession.findMany({
      where: { examId },
      include: {
        user: { select: { name: true, employeeNo: true, department: true } },
        result: {
          select: {
            totalScore: true,
            maxPossibleScore: true,
            isPassed: true,
            isFullyGraded: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: sessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        employeeName: s.user.name,
        employeeNo: s.user.employeeNo,
        department: s.user.department,
        status: s.status,
        attemptNumber: s.attemptNumber,
        startedAt: s.startedAt,
        submittedAt: s.submittedAt,
        tabSwitchCount: s.tabSwitchCount,
        score: s.result?.totalScore ?? null,
        maxScore: s.result?.maxPossibleScore ?? null,
        isPassed: s.result?.isPassed ?? null,
        isFullyGraded: s.result?.isFullyGraded ?? null,
      })),
    });
  } catch (error) {
    console.error('List sessions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/exams/[id]/sessions
 * Deletes all sessions (and related answers, results, audit logs) for an exam.
 * Use for cleaning up test data.
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

    // Delete in dependency order
    const sessions = await prisma.examSession.findMany({
      where: { examId },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { deletedCount: 0 },
      });
    }

    await prisma.$transaction(async (tx) => {
      // Delete audit logs
      await tx.auditLog.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });

      // Delete answers
      await tx.answer.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });

      // Delete results
      await tx.examResult.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });

      // Delete sessions
      await tx.examSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    });

    return NextResponse.json({
      success: true,
      data: { deletedCount: sessionIds.length },
    });
  } catch (error) {
    console.error('Delete sessions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
