import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { generateResultsExcel } from '@/lib/excel';
import type { ResultExportRow } from '@/types/exam';

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

    const sessionWhere: Record<string, unknown> = {
      status: { in: ['SUBMITTED', 'COMPLETED', 'AUTO_SUBMITTED', 'GRADING'] },
    };

    if (examId) {
      sessionWhere.examId = examId;
    }

    const sessions = await prisma.examSession.findMany({
      where: sessionWhere,
      include: {
        user: {
          select: {
            employeeNo: true,
            name: true,
            department: true,
            role: true,
          },
        },
        exam: {
          select: {
            title: true,
          },
        },
        result: true,
      },
      orderBy: { submittedAt: 'desc' },
    });

    const rows: ResultExportRow[] = sessions.map((s) => ({
      employeeNo: s.user.employeeNo,
      employeeName: s.user.name,
      department: s.user.department,
      role: s.user.role,
      examTitle: s.exam.title,
      totalScore: s.result?.totalScore ?? null,
      maxPossibleScore: s.result?.maxPossibleScore ?? 0,
      isPassed: s.result?.isPassed ?? null,
      gradeLabel: s.result?.gradeLabel ?? null,
      timeTakenSeconds: s.result?.timeTakenSeconds ?? 0,
      submittedAt: s.submittedAt?.toISOString() ?? null,
    }));

    const buffer = generateResultsExcel(rows);

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'SCORE_EXPORTED',
        details: {
          examId: examId ?? 'all',
          exportedCount: rows.length,
        },
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="exam-results-${Date.now()}.xlsx"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Export results error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
