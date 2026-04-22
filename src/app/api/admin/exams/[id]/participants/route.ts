import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseParticipantExcel } from '@/lib/excel';
import { hashPassword } from '@/lib/auth';

/**
 * GET /api/admin/exams/[id]/participants
 * List all participants (exam assignments) for a given exam.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: examId } = await params;

    const assignments = await prisma.examAssignment.findMany({
      where: { examId },
      include: {
        user: {
          select: {
            id: true,
            employeeNo: true,
            name: true,
            department: true,
            role: true,
          },
        },
        sessions: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: { id: true, status: true, attemptNumber: true },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    const data = assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      department: a.department,
      role: a.role,
      process: a.process,
      level: a.level,
      user: a.user,
      sessionStatus: a.sessions[0]?.status ?? 'NOT_STARTED',
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Get participants error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/exams/[id]/participants
 * Import participants from an Excel file.
 * Expected columns: 工号, 姓名, 报考工序, 报考等级
 * Also accepts optional 身份证后6位 column.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: examId } = await params;

    // Verify exam exists
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json(
        { success: false, error: '考试不存在' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传文件' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseParticipantExcel(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '文件中未找到有效数据' },
        { status: 400 }
      );
    }

    // Also try to extract idCardLast6 from the raw Excel for user creation
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    const rawRows = sheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      : [];
    const idCardMap = new Map<string, string>();
    for (const raw of rawRows) {
      const row: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        row[key.trim()] = String(value ?? '').trim();
      }
      const empNo = row['工号'] || row['员工编号'] || '';
      const idCard = row['身份证后6位'] || row['身份证後6位'] || '';
      if (empNo && idCard) {
        idCardMap.set(empNo, idCard);
      }
    }

    // Match rows to users and create assignments
    const results = {
      created: 0,
      skipped: 0,
      usersCreated: 0,
      errors: [] as string[],
    };

    for (const row of rows) {
      // Find user by employeeNo
      let user = await prisma.user.findUnique({
        where: { employeeNo: row.employeeNo },
      });

      // If user doesn't exist, create one with basic info
      if (!user) {
        const idCardLast6 = idCardMap.get(row.employeeNo);
        const hashedPassword = idCardLast6 ? await hashPassword(idCardLast6) : null;

        try {
          user = await prisma.user.create({
            data: {
              employeeNo: row.employeeNo,
              name: row.name,
              department: '未分配',
              role: '未分配',
              idCardLast6: hashedPassword,
            },
          });
          results.usersCreated++;
        } catch {
          results.errors.push(`工号 ${row.employeeNo} (${row.name}) 创建用户失败`);
          continue;
        }
      }

      // Check if assignment already exists for this exam + user + process + level
      const existing = await prisma.examAssignment.findFirst({
        where: {
          examId,
          userId: user.id,
          process: row.process,
          level: row.level,
        },
      });

      if (existing) {
        results.skipped++;
        continue;
      }

      // Create assignment
      await prisma.examAssignment.create({
        data: {
          examId,
          userId: user.id,
          department: user.department,
          role: user.role,
          process: row.process,
          level: row.level,
        },
      });
      results.created++;
    }

    return NextResponse.json({
      success: true,
      data: results,
      message: `成功导入 ${results.created} 人，跳过 ${results.skipped} 人（已存在）${results.usersCreated > 0 ? `，新建 ${results.usersCreated} 个用户` : ''}`,
    });
  } catch (error) {
    console.error('Import participants error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
