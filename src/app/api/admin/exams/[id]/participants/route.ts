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

    // ── Batch-optimized: pre-load all users & assignments ──

    // 1. Load ALL users into lookup maps (single query)
    const allUsers = await prisma.user.findMany({
      select: { id: true, employeeNo: true, name: true, department: true, role: true, idCardLast6: true },
    });
    const userByEmpNo = new Map(allUsers.map((u) => [u.employeeNo, u]));
    // Group by name for name-based matching
    const usersByName = new Map<string, typeof allUsers>();
    for (const u of allUsers) {
      const list = usersByName.get(u.name) || [];
      list.push(u);
      usersByName.set(u.name, list);
    }

    // 2. Load existing assignments for this exam (single query)
    const existingAssignments = await prisma.examAssignment.findMany({
      where: { examId },
      select: { userId: true, process: true, level: true },
    });
    const assignmentSet = new Set(
      existingAssignments.map((a) => `${a.userId}||${a.process}||${a.level}`)
    );

    const results = {
      created: 0,
      skipped: 0,
      usersCreated: 0,
      errors: [] as string[],
    };

    // 3. First pass: match rows to existing users, collect new users to create
    type MatchedRow = { row: typeof rows[0]; user: typeof allUsers[0] };
    const matchedRows: MatchedRow[] = [];
    const newUserRows: { row: typeof rows[0]; employeeNo: string; hashedPassword: string | null }[] = [];

    // Hash all verification codes in parallel
    const rowsNeedingHash = rows.filter((r) => r.verificationCode);
    const hashResults = await Promise.all(
      rowsNeedingHash.map((r) => hashPassword(r.verificationCode!))
    );
    const hashMap = new Map<string, string>();
    rowsNeedingHash.forEach((r, i) => {
      hashMap.set(`${r.name}||${r.verificationCode}`, hashResults[i]);
    });

    let autoIdx = 0;
    for (const row of rows) {
      let user: typeof allUsers[0] | undefined;

      // Strategy 1: Find by employeeNo
      if (row.employeeNo) {
        user = userByEmpNo.get(row.employeeNo);
      }

      // Strategy 2: Find by name + department
      if (!user && row.department) {
        const candidates = usersByName.get(row.name);
        user = candidates?.find((u) => u.department === row.department);
      }

      // Strategy 3: Find by name (if unique)
      if (!user) {
        const candidates = usersByName.get(row.name);
        if (candidates?.length === 1) {
          user = candidates[0];
        }
      }

      if (user) {
        matchedRows.push({ row, user });
      } else {
        const employeeNo = row.employeeNo || `AUTO_${Date.now().toString(36)}_${autoIdx++}`;
        const hashedPassword = row.verificationCode
          ? hashMap.get(`${row.name}||${row.verificationCode}`) ?? null
          : null;
        newUserRows.push({ row, employeeNo, hashedPassword });
      }
    }

    // 4. Batch create new users & assignments in a single transaction
    await prisma.$transaction(
      async (tx) => {
        // Batch create new users
        if (newUserRows.length > 0) {
          await tx.user.createMany({
            data: newUserRows.map(({ row, employeeNo, hashedPassword }) => ({
              employeeNo,
              name: row.name,
              department: row.department || '未分配',
              role: row.process || '未分配',
              idCardLast6: hashedPassword,
            })),
            skipDuplicates: true,
          });
          results.usersCreated = newUserRows.length;
        }

        // Re-fetch newly created users to get their IDs
        let newlyCreatedUsers: typeof allUsers = [];
        if (newUserRows.length > 0) {
          const newEmpNos = newUserRows.map((r) => r.employeeNo);
          newlyCreatedUsers = await tx.user.findMany({
            where: { employeeNo: { in: newEmpNos } },
            select: { id: true, employeeNo: true, name: true, department: true, role: true, idCardLast6: true },
          });
        }
        const newUserByEmpNo = new Map(newlyCreatedUsers.map((u) => [u.employeeNo, u]));

        // Build assignments to create
        const assignmentsToCreate: {
          examId: string;
          userId: string;
          department: string;
          role: string;
          process: string;
          level: string;
        }[] = [];

        // From matched (existing) users
        for (const { row, user } of matchedRows) {
          const key = `${user.id}||${row.process}||${row.level}`;
          if (assignmentSet.has(key)) {
            results.skipped++;
            continue;
          }
          assignmentSet.add(key);
          assignmentsToCreate.push({
            examId,
            userId: user.id,
            department: row.department || user.department,
            role: user.role,
            process: row.process,
            level: row.level,
          });
        }

        // From newly created users
        for (const { row, employeeNo } of newUserRows) {
          const newUser = newUserByEmpNo.get(employeeNo);
          if (!newUser) {
            results.errors.push(`${row.name} 创建用户失败`);
            results.usersCreated--;
            continue;
          }
          const key = `${newUser.id}||${row.process}||${row.level}`;
          if (assignmentSet.has(key)) {
            results.skipped++;
            continue;
          }
          assignmentSet.add(key);
          assignmentsToCreate.push({
            examId,
            userId: newUser.id,
            department: row.department || newUser.department,
            role: newUser.role,
            process: row.process,
            level: row.level,
          });
        }

        // Batch create assignments
        if (assignmentsToCreate.length > 0) {
          await tx.examAssignment.createMany({
            data: assignmentsToCreate,
          });
          results.created = assignmentsToCreate.length;
        }

        // Batch update existing users that need field changes
        const updatePromises: Promise<unknown>[] = [];
        for (const { row, user } of matchedRows) {
          const updateData: Record<string, string> = {};
          if (row.verificationCode && !user.idCardLast6) {
            updateData.idCardLast6 = hashMap.get(`${row.name}||${row.verificationCode}`) ?? '';
          }
          if (user.role === '未分配' && row.process) {
            updateData.role = row.process;
          }
          if (Object.keys(updateData).length > 0) {
            updatePromises.push(tx.user.update({ where: { id: user.id }, data: updateData }));
          }
        }
        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
        }
      },
      { timeout: 60000 }
    );

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
