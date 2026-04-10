import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    const resultWhere: Record<string, unknown> = {
      totalScore: { not: null },
    };

    if (examId) {
      resultWhere.session = { examId };
    }

    // Fetch all exam results for analysis
    const results = await prisma.examResult.findMany({
      where: resultWhere,
      include: {
        session: {
          select: {
            examId: true,
            exam: {
              select: {
                id: true,
                title: true,
                passScore: true,
                totalScore: true,
              },
            },
          },
        },
      },
    });

    if (results.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          avgScore: 0,
          passRate: 0,
          totalParticipants: 0,
          scoreDistribution: [],
          difficultyAnalysis: [],
        },
      });
    }

    // Calculate avg score
    const totalScoreSum = results.reduce(
      (sum, r) => sum + (r.totalScore ?? 0),
      0
    );
    const avgScore = Math.round((totalScoreSum / results.length) * 10) / 10;

    // Calculate pass rate
    const passedCount = results.filter((r) => r.isPassed === true).length;
    const passRate = Math.round((passedCount / results.length) * 1000) / 10;

    // Score distribution (ranges of 10)
    const distribution: Record<string, number> = {};
    const ranges = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'];
    for (const range of ranges) {
      distribution[range] = 0;
    }

    for (const r of results) {
      const score = r.totalScore ?? 0;
      if (score >= 90) distribution['90-100']++;
      else if (score >= 80) distribution['80-89']++;
      else if (score >= 70) distribution['70-79']++;
      else if (score >= 60) distribution['60-69']++;
      else if (score >= 50) distribution['50-59']++;
      else if (score >= 40) distribution['40-49']++;
      else if (score >= 30) distribution['30-39']++;
      else if (score >= 20) distribution['20-29']++;
      else if (score >= 10) distribution['10-19']++;
      else distribution['0-9']++;
    }

    const scoreDistribution = Object.entries(distribution).map(([range, count]) => ({
      range,
      count,
    }));

    // Difficulty analysis by category scores
    const categoryTotals: Record<string, { earned: number; max: number; count: number }> = {};

    for (const r of results) {
      if (!r.categoryScores || typeof r.categoryScores !== 'object') continue;
      const scores = r.categoryScores as Record<string, { earnedPoints: number; maxPoints: number }>;
      for (const [type, data] of Object.entries(scores)) {
        if (!categoryTotals[type]) {
          categoryTotals[type] = { earned: 0, max: 0, count: 0 };
        }
        categoryTotals[type].earned += data.earnedPoints;
        categoryTotals[type].max += data.maxPoints;
        categoryTotals[type].count++;
      }
    }

    const difficultyAnalysis = Object.entries(categoryTotals).map(([type, data]) => ({
      questionType: type,
      avgScoreRate: data.max > 0
        ? Math.round((data.earned / data.max) * 1000) / 10
        : 0,
      totalParticipants: data.count,
    }));

    // Highest and lowest scores
    const scores = results.map((r) => r.totalScore ?? 0);
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    // Average time taken
    const avgTimeTaken = Math.round(
      results.reduce((sum, r) => sum + r.timeTakenSeconds, 0) / results.length
    );

    // ---- Ranking: top results with employee info ----
    const rankingResults = examId
      ? await prisma.examResult.findMany({
          where: { totalScore: { not: null }, session: { examId } },
          include: {
            session: {
              select: {
                user: { select: { name: true, employeeNo: true, department: true } },
                submittedAt: true,
              },
            },
          },
          orderBy: { totalScore: 'desc' },
        })
      : [];

    const rankings = rankingResults.map((r, idx) => ({
      rank: idx + 1,
      employeeName: r.session.user.name,
      employeeNo: r.session.user.employeeNo,
      department: r.session.user.department,
      totalScore: r.totalScore ?? 0,
      timeTakenSeconds: r.timeTakenSeconds,
      isPassed: r.isPassed ?? false,
      submittedAt: r.session.submittedAt?.toISOString() ?? null,
    }));

    // ---- Absence: assigned but not participated ----
    let absences: { employeeName: string; employeeNo: string; department: string }[] = [];
    if (examId) {
      // Get all assigned employees (via ExamAssignment)
      const assignments = await prisma.examAssignment.findMany({
        where: { examId },
        select: { userId: true, department: true, role: true },
      });

      // Collect assigned user IDs
      const assignedUserIds = assignments.filter((a) => a.userId).map((a) => a.userId!);

      // Also find users matching department/role assignments
      const deptAssignments = assignments.filter((a) => !a.userId && a.department);
      let deptMatchedUserIds: string[] = [];
      if (deptAssignments.length > 0) {
        const deptUsers = await prisma.user.findMany({
          where: {
            isActive: true,
            OR: deptAssignments.map((a) => ({
              department: a.department!,
              ...(a.role ? { role: a.role } : {}),
            })),
          },
          select: { id: true },
        });
        deptMatchedUserIds = deptUsers.map((u) => u.id);
      }

      const allAssignedIds = [...new Set([...assignedUserIds, ...deptMatchedUserIds])];

      if (allAssignedIds.length > 0) {
        // Find who has completed sessions
        const completedSessions = await prisma.examSession.findMany({
          where: {
            examId,
            userId: { in: allAssignedIds },
            status: { in: ['SUBMITTED', 'GRADING', 'COMPLETED', 'AUTO_SUBMITTED'] },
          },
          select: { userId: true },
        });
        const completedUserIds = new Set(completedSessions.map((s) => s.userId));

        // Also check in-progress
        const inProgressSessions = await prisma.examSession.findMany({
          where: {
            examId,
            userId: { in: allAssignedIds },
            status: 'IN_PROGRESS',
          },
          select: { userId: true },
        });
        const activeUserIds = new Set(inProgressSessions.map((s) => s.userId));

        // Absent = assigned but no session at all
        const absentIds = allAssignedIds.filter(
          (id) => !completedUserIds.has(id) && !activeUserIds.has(id)
        );

        if (absentIds.length > 0) {
          const absentUsers = await prisma.user.findMany({
            where: { id: { in: absentIds } },
            select: { name: true, employeeNo: true, department: true },
          });
          absences = absentUsers.map((u) => ({
            employeeName: u.name,
            employeeNo: u.employeeNo,
            department: u.department,
          }));
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        avgScore,
        passRate,
        totalParticipants: results.length,
        highestScore,
        lowestScore,
        avgTimeTaken,
        scoreDistribution,
        difficultyAnalysis,
        rankings,
        absences,
        absentCount: absences.length,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
