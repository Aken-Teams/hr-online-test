import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * GET /api/admin/exams/[id]/assignment-options
 * Return distinct process and level values from ExamAssignment for this exam.
 */
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

    const assignments = await prisma.examAssignment.findMany({
      where: { examId },
      select: { process: true, level: true },
    });

    const processes = [...new Set(assignments.map((a) => a.process).filter(Boolean))] as string[];
    const levels = [...new Set(assignments.map((a) => a.level).filter(Boolean))] as string[];

    return NextResponse.json({
      success: true,
      data: { processes: processes.sort(), levels: levels.sort() },
    });
  } catch (error) {
    console.error('Get assignment options error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
