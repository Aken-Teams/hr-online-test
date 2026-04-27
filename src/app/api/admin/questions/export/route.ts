import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { generateQuestionsExcel } from '@/lib/excel';
import type { QuestionExportRow } from '@/lib/excel';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { isActive: true };
    if (examId) {
      where.examSourceId = examId;
    }

    const questions = await prisma.question.findMany({
      where,
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ type: 'asc' }, { department: 'asc' }, { createdAt: 'asc' }],
    });

    const rows: QuestionExportRow[] = questions.map((q) => ({
      type: QUESTION_TYPE_LABELS[q.type] || q.type,
      content: q.content,
      correctAnswer: q.correctAnswer,
      options: q.options.map((o) => o.content),
      isMultiSelect: q.isMultiSelect,
      category: q.category,
      process: q.process,
      department: q.department,
      level: q.level,
      points: q.points,
    }));

    const buffer = generateQuestionsExcel(rows);

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'SCORE_EXPORTED',
        details: { type: 'questions', examId: examId ?? 'all', exportedCount: rows.length },
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="questions-${Date.now()}.xlsx"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Export questions error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
