import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { MANUAL_GRADE_TYPES } from '@/lib/constants';
import { getAdminScope, buildSessionScopeFilter } from '@/lib/admin-scope';

/**
 * GET /api/admin/grading/exams
 *
 * 评卷人门户：列出「我负责工序」内、有简答题待评分/已评分的考试，含进度统计。
 * 依 admin_scopes 做工序隔离（GRADER 只见自己工序；非 GRADER 不受限）。
 */
export async function GET() {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    const scope = await getAdminScope(admin);
    const scopeFilter = buildSessionScopeFilter(scope);

    const answers = await prisma.answer.findMany({
      where: {
        question: { type: { in: MANUAL_GRADE_TYPES } },
        session: {
          status: { in: ['SUBMITTED', 'GRADING', 'AUTO_SUBMITTED', 'COMPLETED'] },
          ...scopeFilter,
        },
      },
      select: {
        earnedPoints: true,
        aiScore: true,
        session: {
          select: {
            examId: true,
            exam: { select: { title: true, status: true, createdAt: true } },
          },
        },
      },
    });

    type Row = {
      examId: string; title: string; status: string; createdAt: string;
      total: number; pending: number; graded: number; aiSuggested: number;
    };
    const map = new Map<string, Row>();
    for (const a of answers) {
      const examId = a.session.examId;
      const ex = a.session.exam;
      let row = map.get(examId);
      if (!row) {
        row = {
          examId, title: ex.title, status: ex.status,
          createdAt: ex.createdAt.toISOString(),
          total: 0, pending: 0, graded: 0, aiSuggested: 0,
        };
        map.set(examId, row);
      }
      row.total += 1;
      if (a.earnedPoints === null) {
        row.pending += 1;
        if (a.aiScore != null) row.aiSuggested += 1;
      } else {
        row.graded += 1;
      }
    }

    // 待评分多的排前面，其次新考试在前
    const exams = [...map.values()].sort((a, b) =>
      b.pending - a.pending || b.createdAt.localeCompare(a.createdAt)
    );

    return NextResponse.json({
      success: true,
      data: {
        scopedProcesses: scope?.processes ?? null,
        role: admin.role,
        exams,
      },
    });
  } catch (error) {
    console.error('Grading exams list error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
