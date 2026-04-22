import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import type { MyResultItem } from '@/types/exam';

/**
 * GET /api/exam/my-results
 * Returns all completed exam results for the current employee,
 * with result query window checks.
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

    // Find all sessions with results
    const sessions = await prisma.examSession.findMany({
      where: {
        userId: employee.userId,
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'COMPLETED'] },
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            resultQueryOpenAt: true,
            resultQueryCloseAt: true,
          },
        },
        assignment: {
          select: {
            process: true,
            level: true,
          },
        },
        result: {
          select: {
            autoScore: true,
            maxPossibleScore: true,
            practicalScore: true,
            combinedScore: true,
            isPassed: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const items: MyResultItem[] = sessions
      .filter((s) => s.result)
      .map((s) => {
        const exam = s.exam;
        const result = s.result!;
        const isAfterOpen = exam.resultQueryOpenAt ? exam.resultQueryOpenAt <= now : true;
        const isBeforeClose = exam.resultQueryCloseAt ? exam.resultQueryCloseAt >= now : true;
        const isResultQueryOpen = isAfterOpen && isBeforeClose;

        return {
          examId: exam.id,
          examTitle: exam.title,
          process: s.assignment?.process ?? null,
          level: s.assignment?.level ?? null,
          sessionId: s.id,
          autoScore: result.autoScore,
          maxPossibleScore: result.maxPossibleScore,
          practicalScore: result.practicalScore ?? null,
          combinedScore: result.combinedScore ?? null,
          isPassed: result.isPassed ?? null,
          submittedAt: s.submittedAt?.toISOString() ?? null,
          isResultQueryOpen,
          resultQueryOpenAt: exam.resultQueryOpenAt?.toISOString() ?? null,
          resultQueryCloseAt: exam.resultQueryCloseAt?.toISOString() ?? null,
        };
      });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Get my-results error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
