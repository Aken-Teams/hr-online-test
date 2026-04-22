import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

export async function GET() {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const [
      totalExams,
      activeExams,
      totalQuestions,
      totalEmployees,
      activeSessions,
      pendingGrading,
      results,
    ] = await Promise.all([
      prisma.exam.count(),
      prisma.exam.count({
        where: { status: { in: ['PUBLISHED', 'ACTIVE'] } },
      }),
      prisma.question.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.examSession.count({
        where: { status: 'IN_PROGRESS' },
      }),
      prisma.answer.count({
        where: {
          earnedPoints: null,
          question: {
            type: { in: ['SHORT_ANSWER', 'FILL_BLANK', 'CASE_ANALYSIS', 'PRACTICAL'] },
          },
          session: {
            status: { in: ['SUBMITTED', 'GRADING', 'AUTO_SUBMITTED'] },
          },
        },
      }),
      prisma.examResult.findMany({
        where: { totalScore: { not: null } },
        select: {
          totalScore: true,
          maxPossibleScore: true,
          isPassed: true,
        },
      }),
    ]);

    // Calculate average score and pass rate
    let avgScore = 0;
    let passRate = 0;

    if (results.length > 0) {
      const totalScoreSum = results.reduce(
        (sum, r) => sum + (r.totalScore ?? 0),
        0
      );
      avgScore = Math.round((totalScoreSum / results.length) * 10) / 10;

      const passedCount = results.filter((r) => r.isPassed === true).length;
      passRate = Math.round((passedCount / results.length) * 1000) / 10;
    }

    // Fetch recent sessions
    const recentSessions = await prisma.examSession.findMany({
      take: 10,
      orderBy: { startedAt: 'desc' },
      include: {
        user: { select: { name: true, department: true } },
        exam: { select: { title: true } },
        result: { select: { totalScore: true, autoScore: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalExams,
          activeExams,
          totalQuestions,
          totalEmployees,
          activeSessions,
          pendingGrading,
          averagePassRate: passRate,
        },
        recentSessions: recentSessions.map((s) => ({
          id: s.id,
          employeeName: s.user.name,
          department: s.user.department,
          examTitle: s.exam.title,
          status: s.status,
          score: s.result?.totalScore ?? s.result?.autoScore ?? null,
          submittedAt: s.submittedAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
