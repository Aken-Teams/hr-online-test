import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseOfflineScoreExcel, generateOfflineScoreTemplate } from '@/lib/excel';

/**
 * POST /api/admin/exams/[id]/offline-scores
 * Import offline scores (essay + practical) from an Excel file.
 * Matches employees by employeeNo or name to existing sessions,
 * then calculates combined score: (onlineAutoScore + essayScore) * 0.4 + practicalScore * 0.6
 */
export async function POST(
  request: Request,
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

    // Verify exam exists
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, title: true },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    // Parse the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传 Excel 文件' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseOfflineScoreExcel(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '文件中没有有效数据，请检查列名是否包含：工号、姓名、简答分、实操分' },
        { status: 400 }
      );
    }

    // Get all sessions with results for this exam
    const sessions = await prisma.examSession.findMany({
      where: {
        examId,
        status: { in: ['SUBMITTED', 'COMPLETED', 'AUTO_SUBMITTED', 'GRADING'] },
      },
      include: {
        user: { select: { employeeNo: true, name: true } },
        result: true,
      },
    });

    // Build lookup maps
    const sessionByEmployeeNo = new Map(
      sessions
        .filter((s) => s.user.employeeNo)
        .map((s) => [s.user.employeeNo, s])
    );
    const sessionByName = new Map(
      sessions.map((s) => [s.user.name, s])
    );

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      // Match by employeeNo first, then by name
      const session = (row.employeeNo && sessionByEmployeeNo.get(row.employeeNo))
        || sessionByName.get(row.name);

      if (!session) {
        skipped++;
        errors.push(`未找到匹配: ${row.employeeNo || ''} ${row.name}`);
        continue;
      }

      if (!session.result) {
        skipped++;
        errors.push(`无考试成绩记录: ${row.employeeNo || ''} ${row.name}`);
        continue;
      }

      const essayScore = row.essayScore ?? session.result.essayScore ?? null;
      const practicalScore = row.practicalScore ?? session.result.practicalScore ?? null;

      // Calculate combined score: (online + essay) * 40% + practical * 60%
      const onlineScore = session.result.totalScore ?? session.result.autoScore;
      let combinedScore: number | null = null;
      if (essayScore != null && practicalScore != null) {
        combinedScore = Math.round(((onlineScore + essayScore) * 0.4 + practicalScore * 0.6) * 10) / 10;
      }

      await prisma.examResult.update({
        where: { id: session.result.id },
        data: {
          essayScore,
          practicalScore,
          combinedScore,
        },
      });

      updated++;
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'SCORE_EXPORTED', // Reuse existing action for score import
        details: {
          examId,
          action: 'offline_score_import',
          totalRows: rows.length,
          updated,
          skipped,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        updated,
        skipped,
        errors: errors.slice(0, 10), // Return first 10 errors
      },
    });
  } catch (error) {
    console.error('Import offline scores error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/exams/[id]/offline-scores
 * ?action=template — download an Excel template pre-filled with employee info
 * (default) — get offline score status JSON for all sessions
 */
export async function GET(
  request: Request,
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
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const sessions = await prisma.examSession.findMany({
      where: {
        examId,
        status: { in: ['SUBMITTED', 'COMPLETED', 'AUTO_SUBMITTED', 'GRADING'] },
      },
      include: {
        user: { select: { employeeNo: true, name: true, department: true } },
        result: {
          select: {
            autoScore: true,
            totalScore: true,
            essayScore: true,
            practicalScore: true,
            combinedScore: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // Download template
    if (action === 'template') {
      const employees = sessions.map((s) => ({
        employeeNo: s.user.employeeNo || '',
        name: s.user.name,
        department: s.user.department || '',
        onlineScore: s.result?.totalScore ?? s.result?.autoScore ?? 0,
        essayScore: '',
        practicalScore: '',
      }));

      const buffer = generateOfflineScoreTemplate(employees);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="offline_score_template.xlsx"`,
        },
      });
    }

    // Default: return JSON status
    const data = sessions.map((s) => ({
      sessionId: s.id,
      employeeNo: s.user.employeeNo,
      name: s.user.name,
      department: s.user.department,
      onlineScore: s.result?.totalScore ?? s.result?.autoScore ?? 0,
      essayScore: s.result?.essayScore ?? null,
      practicalScore: s.result?.practicalScore ?? null,
      combinedScore: s.result?.combinedScore ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Get offline scores error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
