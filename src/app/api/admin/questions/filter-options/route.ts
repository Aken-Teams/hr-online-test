import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';

/**
 * GET /api/admin/questions/filter-options
 * Returns distinct values for question filters.
 * If ?examSourceId=xxx is provided, scopes to that exam's questions.
 */
export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const examSourceId = searchParams.get('examSourceId') || undefined;

    const where = examSourceId ? { examSourceId } : {};
    // Levels only from PROFESSIONAL questions — BASIC levels are inconsistent/messy
    const whereProfessional = { ...where, category: 'PROFESSIONAL' };

    const [departments, levels, processes, categories, types] = await Promise.all([
      prisma.question.findMany({ where, select: { department: true }, distinct: ['department'] }),
      prisma.question.findMany({ where: whereProfessional, select: { level: true }, distinct: ['level'] }),
      prisma.question.findMany({ where, select: { process: true }, distinct: ['process'] }),
      prisma.question.findMany({ where, select: { category: true }, distinct: ['category'] }),
      prisma.question.findMany({ where, select: { type: true }, distinct: ['type'] }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        departments: departments.map((d) => d.department).filter(Boolean).sort(),
        levels: levels.map((l) => l.level).filter(Boolean).sort(),
        processes: processes.map((p) => p.process).filter(Boolean).sort(),
        categories: categories.map((c) => c.category).filter(Boolean).sort(),
        types: types.map((t) => t.type).filter(Boolean).sort(),
      },
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
