import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import type { MyResultItem } from '@/types/exam';

/**
 * GET /api/exam/my-results
 * Returns all exam results for the current employee (per-assignment).
 * Each assignment is treated independently — same exam with different
 * process/level shows as separate rows. Uses LEFT JOIN via Prisma include
 * so assignments without sessions also appear (as "missed" if exam ended).
 */
export async function GET() {
  try {
    const employee = await getEmployeeFromCookie();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未登录或登录已过期' },
        { status: 401 }
      );
    }

    const now = new Date();

    // Single query: get ALL assignments with their sessions + results (LEFT JOIN)
    const allAssignments = await prisma.examAssignment.findMany({
      where: {
        OR: [
          { userId: employee.userId },
          { userId: null, department: employee.department },
        ],
        exam: {
          status: { in: ['PUBLISHED', 'ACTIVE', 'CLOSED', 'ARCHIVED'] },
        },
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalScore: true,
            status: true,
            closeAt: true,
            resultQueryOpenAt: true,
            resultQueryCloseAt: true,
            showResultImmediately: true,
          },
        },
        // LEFT JOIN: sessions linked to this specific assignment
        sessions: {
          where: {
            userId: employee.userId,
            status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'GRADING', 'COMPLETED'] },
          },
          orderBy: { submittedAt: 'desc' },
          take: 1,
          include: {
            result: {
              select: {
                autoScore: true,
                totalScore: true,
                maxPossibleScore: true,
                practicalScore: true,
                combinedScore: true,
                isPassed: true,
                isFullyGraded: true,
              },
            },
          },
        },
      },
      orderBy: { exam: { createdAt: 'desc' } },
    });

    // Also find "loose" sessions (no assignmentId) for backward compatibility
    const examIds = [...new Set(allAssignments.map((a) => a.exam.id))];
    const looseSessions = examIds.length
      ? await prisma.examSession.findMany({
          where: {
            userId: employee.userId,
            examId: { in: examIds },
            assignmentId: null,
            status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'GRADING', 'COMPLETED'] },
          },
          orderBy: { submittedAt: 'desc' },
          include: {
            result: {
              select: {
                autoScore: true,
                totalScore: true,
                maxPossibleScore: true,
                practicalScore: true,
                combinedScore: true,
                isPassed: true,
                isFullyGraded: true,
              },
            },
          },
        })
      : [];
    // Map: examId → first loose session (most recent)
    const looseByExam = new Map<string, (typeof looseSessions)[0]>();
    for (const s of looseSessions) {
      if (!looseByExam.has(s.examId)) looseByExam.set(s.examId, s);
    }

    // Build result items — one per assignment
    const items: MyResultItem[] = [];

    for (const a of allAssignments) {
      const exam = a.exam;
      const session = a.sessions[0] || looseByExam.get(exam.id) || null;
      const result = session?.result ?? null;

      const isClosed = exam.status === 'CLOSED' || exam.status === 'ARCHIVED';
      const isPastClose = exam.closeAt ? exam.closeAt < now : false;
      const examEnded = isClosed || isPastClose;

      // 报告（错题解析/正确答案/个人报告）开放：未设开放时间 = 默认不开放
      const isAfterOpen = exam.resultQueryOpenAt ? exam.resultQueryOpenAt <= now : false;
      const isBeforeClose = exam.resultQueryCloseAt ? exam.resultQueryCloseAt >= now : true;
      const isResultQueryOpen = isAfterOpen && isBeforeClose;
      // 总分可见：立即出分开启，或报告已开放（关闭立即出分时统一公布）
      const scoreVisible = exam.showResultImmediately || isResultQueryOpen;

      if (session && result) {
        // Has completed session with result → show score
        items.push({
          examId: exam.id,
          examTitle: exam.title,
          process: a.process,
          level: a.level,
          sessionId: session.id,
          // 线上分 = 线上理论总分（客观题 autoScore + 简答题 manualScore），
          // 全简答题考试 autoScore=0，须用 totalScore 才不会显示成 0 分
          autoScore: result.totalScore ?? result.autoScore,
          maxPossibleScore: result.maxPossibleScore,
          practicalScore: result.practicalScore ?? null,
          combinedScore: result.combinedScore ?? null,
          isPassed: result.isPassed ?? null,
          isPendingGrading: !result.isFullyGraded,
          submittedAt: session.submittedAt?.toISOString() ?? null,
          isResultQueryOpen,
          scoreVisible,
          resultQueryOpenAt: exam.resultQueryOpenAt?.toISOString() ?? null,
          resultQueryCloseAt: exam.resultQueryCloseAt?.toISOString() ?? null,
          missed: false,
        });
      } else if (examEnded) {
        // Exam ended, no session for this assignment → missed
        items.push({
          examId: exam.id,
          examTitle: exam.title,
          process: a.process,
          level: a.level,
          sessionId: '',
          autoScore: 0,
          maxPossibleScore: exam.totalScore,
          practicalScore: null,
          combinedScore: null,
          isPassed: null,
          isPendingGrading: false,
          submittedAt: null,
          isResultQueryOpen: true,
          scoreVisible: true,
          resultQueryOpenAt: exam.resultQueryOpenAt?.toISOString() ?? null,
          resultQueryCloseAt: exam.resultQueryCloseAt?.toISOString() ?? null,
          missed: true,
        });
      }
      // If exam still open and no session → skip (not relevant for scores page)
    }

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Get my-results error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
