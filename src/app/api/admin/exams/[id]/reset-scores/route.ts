import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * POST /api/admin/exams/[id]/reset-scores
 * Reset all exam scores — deletes sessions, answers, results, and exam_questions
 * but keeps questions (question bank) and assignments (participants) intact.
 */
export async function POST(
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

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        _count: { select: { sessions: true } },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    if (exam._count.sessions === 0) {
      return NextResponse.json(
        { success: false, error: '该考试没有考试记录' },
        { status: 400 }
      );
    }

    // Get all session IDs for this exam
    const sessions = await prisma.examSession.findMany({
      where: { examId },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    // Delete in order: answers → results → audit_logs → sessions → exam_questions
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.examResult.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.auditLog.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.examSession.deleteMany({ where: { examId } }),
      prisma.examQuestion.deleteMany({ where: { examId } }),
    ]);

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'SCORES_RESET' as never,
        details: {
          examId,
          examTitle: exam.title,
          deletedSessions: sessionIds.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: { deletedSessions: sessionIds.length },
    });
  } catch (error) {
    console.error('Reset scores error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
