import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseParticipantExcel, extractParticipantHeadersAndSamples } from '@/lib/excel';
import { hashPassword } from '@/lib/auth';
import { identifyColumnsWithAI } from '@/lib/deepseek';

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
 * Required columns: 姓名, 报考工序, 报考等级
 * Optional columns: 工号, 部门, 身份证后6位/验证码
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
    let rows = parseParticipantExcel(buffer);

    // AI fallback: if parsing returns 0 rows, try AI column identification
    if (rows.length === 0) {
      const extracted = extractParticipantHeadersAndSamples(buffer);
      if (extracted) {
        const aiMapping = await identifyColumnsWithAI(
          extracted.headers,
          extracted.sampleRows,
          'participant'
        );
        if (aiMapping) {
          rows = parseParticipantExcel(buffer, aiMapping);
        }
      }
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '文件中未找到有效数据（需要至少包含：姓名、工序、等级）' },
        { status: 400 }
      );
    }

    // Match rows to users and create assignments
    const results = {
      created: 0,
      skipped: 0,
      usersCreated: 0,
      errors: [] as string[],
    };

    for (const row of rows) {
      let user = null;

      // Strategy 1: Find by employeeNo if provided
      if (row.employeeNo) {
        user = await prisma.user.findUnique({
          where: { employeeNo: row.employeeNo },
        });
      }

      // Strategy 2: Find by name + department
      if (!user && row.department) {
        user = await prisma.user.findFirst({
          where: {
            name: row.name,
            department: row.department,
          },
        });
      }

      // Strategy 3: Find by name only (if unique)
      if (!user) {
        const matches = await prisma.user.findMany({
          where: { name: row.name },
          take: 2,
        });
        if (matches.length === 1) {
          user = matches[0];
        }
      }

      // Create user if not found
      if (!user) {
        const hashedPassword = row.verificationCode
          ? await hashPassword(row.verificationCode)
          : null;

        // Auto-generate employeeNo if not provided
        const employeeNo = row.employeeNo || `AUTO_${row.name}_${Date.now()}`;

        try {
          user = await prisma.user.create({
            data: {
              employeeNo,
              name: row.name,
              department: row.department || '未分配',
              role: '未分配',
              idCardLast6: hashedPassword,
            },
          });
          results.usersCreated++;
        } catch {
          results.errors.push(`${row.name} 创建用户失败`);
          continue;
        }
      } else if (row.verificationCode && !user.idCardLast6) {
        // Update verification code if user exists but has no password
        const hashedPassword = await hashPassword(row.verificationCode);
        await prisma.user.update({
          where: { id: user.id },
          data: { idCardLast6: hashedPassword },
        });
      }

      // Check if assignment already exists
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
          department: row.department || user.department,
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
