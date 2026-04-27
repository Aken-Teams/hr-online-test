import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { generateParticipantsExcel } from '@/lib/excel';
import type { ParticipantExportRow } from '@/lib/excel';

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    if (!examId) {
      return NextResponse.json({ success: false, error: '请选择考试' }, { status: 400 });
    }

    const assignments = await prisma.examAssignment.findMany({
      where: { examId },
      include: {
        user: { select: { employeeNo: true, name: true, department: true } },
        sessions: { select: { status: true } },
      },
    });

    const statusMap: Record<string, string> = {
      NOT_STARTED: '未考',
      IN_PROGRESS: '考试中',
      SUBMITTED: '已交卷',
      COMPLETED: '已完成',
      AUTO_SUBMITTED: '已交卷',
    };

    const rows: ParticipantExportRow[] = assignments.map((a) => {
      const latestStatus = a.sessions[a.sessions.length - 1]?.status ?? 'NOT_STARTED';
      return {
        employeeNo: a.user?.employeeNo ?? '',
        name: a.user?.name ?? '',
        department: a.user?.department ?? a.department ?? '',
        process: a.process ?? '',
        level: a.level ?? '',
        status: statusMap[latestStatus] ?? '未考',
      };
    });

    rows.sort((a, b) => a.name.localeCompare(b.name));

    const buffer = generateParticipantsExcel(rows);

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'SCORE_EXPORTED',
        details: { type: 'participants', examId, exportedCount: rows.length },
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="participants-${Date.now()}.xlsx"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Export participants error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
