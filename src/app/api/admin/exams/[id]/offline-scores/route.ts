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

    // Verify exam exists (include weights for score calculation)
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, title: true, theoryWeight: true, practicalWeight: true, compositePassScore: true },
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

    // Get all sessions with results for this exam (include assignment for process matching)
    const sessions = await prisma.examSession.findMany({
      where: {
        examId,
        status: { in: ['SUBMITTED', 'COMPLETED', 'AUTO_SUBMITTED', 'GRADING'] },
      },
      include: {
        user: { select: { employeeNo: true, name: true } },
        assignment: { select: { process: true, level: true } },
        result: true,
      },
    });

    // Build lookup maps (key: employeeNo or employeeNo+process for multi-process)
    const sessionByKey = new Map<string, typeof sessions[0]>();
    for (const s of sessions) {
      const empNo = s.user.employeeNo;
      const process = s.assignment?.process || '';
      // Store with process for precise matching
      if (empNo && process) {
        sessionByKey.set(`${empNo}__${process}`, s);
      }
      // Also store by employeeNo only (fallback)
      if (empNo && !sessionByKey.has(empNo)) {
        sessionByKey.set(empNo, s);
      }
      // Also by name
      if (!sessionByKey.has(s.user.name)) {
        sessionByKey.set(s.user.name, s);
      }
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const theoryWeight = exam.theoryWeight ?? 0.4;
    const practicalWeight = exam.practicalWeight ?? 0.6;

    for (const row of rows) {
      // Match by employeeNo+process first (precise), then employeeNo, then name
      const session = (row.employeeNo && row.process && sessionByKey.get(`${row.employeeNo}__${row.process}`))
        || (row.employeeNo && sessionByKey.get(row.employeeNo))
        || sessionByKey.get(row.name);

      if (!session) {
        skipped++;
        errors.push(`未找到匹配: ${row.employeeNo || ''} ${row.name}${row.process ? ` (${row.process})` : ''}`);
        continue;
      }

      if (!session.result) {
        skipped++;
        errors.push(`无考试成绩记录: ${row.employeeNo || ''} ${row.name}`);
        continue;
      }

      const practicalScore = row.practicalScore ?? session.result.practicalScore ?? null;

      // Calculate combined score: onlineScore × theoryWeight + practicalScore × practicalWeight
      const onlineScore = session.result.totalScore ?? session.result.autoScore;
      let combinedScore: number | null = null;
      if (practicalScore != null) {
        combinedScore = Math.round((onlineScore * theoryWeight + practicalScore * practicalWeight) * 10) / 10;
      }

      await prisma.examResult.update({
        where: { id: session.result.id },
        data: {
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

    const sessionsForTemplate = await prisma.examSession.findMany({
      where: {
        examId,
        status: { in: ['SUBMITTED', 'COMPLETED', 'AUTO_SUBMITTED', 'GRADING'] },
      },
      include: {
        user: { select: { employeeNo: true, name: true, department: true } },
        assignment: { select: { process: true, level: true } },
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
      const employees = sessionsForTemplate.map((s) => ({
        employeeNo: s.user.employeeNo || '',
        name: s.user.name,
        department: s.user.department || '',
        process: s.assignment?.process || '',
        onlineScore: s.result?.totalScore ?? s.result?.autoScore ?? 0,
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
    const data = sessionsForTemplate.map((s) => ({
      sessionId: s.id,
      employeeNo: s.user.employeeNo,
      name: s.user.name,
      department: s.user.department,
      process: s.assignment?.process ?? null,
      level: s.assignment?.level ?? null,
      onlineScore: s.result?.totalScore ?? s.result?.autoScore ?? 0,
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
