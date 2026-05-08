import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { parseParticipantExcel, extractParticipantHeadersAndSamples } from '@/lib/excel';
import { encryptValue, isBcryptHash } from '@/lib/auth';
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

    const [assignments, examBatches] = await Promise.all([
      prisma.examAssignment.findMany({
        where: { examId },
        include: {
          user: {
            select: { id: true, employeeNo: true, name: true, department: true, role: true },
          },
          sessions: {
            orderBy: { attemptNumber: 'desc' },
            take: 1,
            select: { id: true, status: true, attemptNumber: true },
          },
          batch: { select: { id: true, name: true, openAt: true, closeAt: true } },
          previousBatch: { select: { id: true, name: true } },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.examBatch.findMany({
        where: { examId },
        orderBy: { openAt: 'asc' },
        select: { id: true, name: true, openAt: true, closeAt: true },
      }),
    ]);

    const data = assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      department: a.department,
      role: a.role,
      process: a.process,
      level: a.level,
      batchId: a.batchId,
      batchName: a.batch?.name ?? null,
      previousBatchId: a.previousBatchId,
      previousBatchName: a.previousBatch?.name ?? null,
      batchChanged: a.previousBatchId !== null,
      user: a.user,
      sessionStatus: a.sessions[0]?.status ?? 'NOT_STARTED',
    }));

    return NextResponse.json({ success: true, data, examBatches });
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
 * - JSON body { userId, process, level, department? }: Add a single participant (non-destructive).
 * - FormData with file: Import participants from an Excel file (overwrites existing).
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

    // ── Single participant (JSON) ──
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { userId, process: proc, level, department, batchId } = body as {
        userId?: string;
        process?: string;
        level?: string;
        department?: string;
        batchId?: string | null;
      };

      if (!userId || !proc || !level) {
        return NextResponse.json(
          { success: false, error: '请填写必填字段：userId、工序、等级' },
          { status: 400 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, department: true, role: true },
      });
      if (!user) {
        return NextResponse.json({ success: false, error: '员工不存在' }, { status: 404 });
      }

      // Check for duplicate assignment (same userId + process)
      const existing = await prisma.examAssignment.findFirst({
        where: { examId, userId, process: proc },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: '该员工已在应考名单中（相同工序）' },
          { status: 409 }
        );
      }

      const assignment = await prisma.examAssignment.create({
        data: {
          examId,
          userId,
          department: department || user.department || '',
          role: user.role || '',
          process: proc,
          level,
          ...(batchId ? { batchId } : {}),
        },
      });

      return NextResponse.json({ success: true, data: { id: assignment.id }, message: '已添加应考人员' });
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

    // ── Pre-load exam batches for batchHint resolution ──
    const examBatchList = await prisma.examBatch.findMany({
      where: { examId },
      orderBy: { openAt: 'asc' },
      select: { id: true, name: true },
    });

    function resolveBatchHint(hint: string | undefined): string | null {
      if (!hint) return null;
      const num = parseInt(hint);
      if (!isNaN(num) && num >= 1 && num <= examBatchList.length) {
        return examBatchList[num - 1].id;
      }
      const exact = examBatchList.find((b) => b.name === hint);
      if (exact) return exact.id;
      const partial = examBatchList.find((b) => b.name.includes(hint));
      return partial?.id ?? null;
    }

    // ── Pre-load all users for matching ──
    const allUsers = await prisma.user.findMany({
      select: { id: true, employeeNo: true, name: true, department: true, role: true, idCardLast6: true },
    });
    const userByEmpNo = new Map(allUsers.map((u) => [u.employeeNo, u]));
    const usersByName = new Map<string, typeof allUsers>();
    for (const u of allUsers) {
      const list = usersByName.get(u.name) || [];
      list.push(u);
      usersByName.set(u.name, list);
    }

    // Filter out placeholder/invalid verification codes before encryption
    const INVALID_CODES = ['(旧格式，需重新导入)', '(解密失败)', ''];
    for (const r of rows) {
      if (r.verificationCode && INVALID_CODES.includes(r.verificationCode.trim())) {
        r.verificationCode = '';
      }
    }

    const rowsWithCode = rows.filter((r) => r.verificationCode);
    console.log(`[participants-import] Total rows: ${rows.length}, rows with verificationCode: ${rowsWithCode.length}`);
    if (rowsWithCode.length > 0) {
      console.log(`[participants-import] Sample codes:`, rowsWithCode.slice(0, 3).map((r) => ({ name: r.name, code: r.verificationCode?.substring(0, 2) + '***' })));
    }

    // Encrypt all verification codes
    const encryptMap = new Map<string, string>();
    for (const r of rows) {
      if (r.verificationCode) {
        const key = `${r.name}||${r.verificationCode}`;
        if (!encryptMap.has(key)) {
          encryptMap.set(key, encryptValue(r.verificationCode));
        }
      }
    }

    // Match rows to users, collect new users to create
    type MatchedRow = { row: typeof rows[0]; user: typeof allUsers[0] };
    const matchedRows: MatchedRow[] = [];
    const newUserRows: { row: typeof rows[0]; employeeNo: string; encryptedPassword: string | null }[] = [];

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
        const encryptedPassword = row.verificationCode
          ? encryptMap.get(`${row.name}||${row.verificationCode}`) ?? null
          : null;
        newUserRows.push({ row, employeeNo, encryptedPassword });
      }
    }

    const results = {
      created: 0,
      replaced: 0,
      usersCreated: 0,
      codesUpdated: 0,
      codesCleared: 0,
      errors: [] as string[],
    };

    await prisma.$transaction(
      async (tx) => {
        // ── Step 1: Delete all existing assignments for this exam ──
        const oldCount = await tx.examAssignment.count({ where: { examId } });

        // Unlink sessions (set assignmentId = null) to preserve exam history
        await tx.examSession.updateMany({
          where: { assignmentId: { not: null }, assignment: { examId } },
          data: { assignmentId: null },
        });
        // Delete old assignments
        await tx.examAssignment.deleteMany({ where: { examId } });
        results.replaced = oldCount;

        // ── Step 2: Create new users (if any) ──
        if (newUserRows.length > 0) {
          await tx.user.createMany({
            data: newUserRows.map(({ row, employeeNo, encryptedPassword }) => ({
              employeeNo,
              name: row.name,
              department: row.department || '未分配',
              role: row.process || '未分配',
              idCardLast6: encryptedPassword,
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

        // ── Step 3: Create all assignments ──
        const assignments: {
          examId: string;
          userId: string;
          department: string;
          role: string;
          process: string;
          level: string;
          batchId?: string;
        }[] = [];

        // Dedup: same userId + process should only appear once
        const seen = new Set<string>();

        for (const { row, user } of matchedRows) {
          const key = `${user.id}||${row.process}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const batchId = resolveBatchHint(row.batchHint) ?? undefined;
          assignments.push({
            examId,
            userId: user.id,
            department: row.department || user.department,
            role: user.role,
            process: row.process,
            level: row.level,
            ...(batchId ? { batchId } : {}),
          });
        }

        for (const { row, employeeNo } of newUserRows) {
          const newUser = newUserByEmpNo.get(employeeNo);
          if (!newUser) {
            results.errors.push(`${row.name} 创建用户失败`);
            results.usersCreated--;
            continue;
          }
          const key = `${newUser.id}||${row.process}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const batchId = resolveBatchHint(row.batchHint) ?? undefined;
          assignments.push({
            examId,
            userId: newUser.id,
            department: row.department || newUser.department,
            role: newUser.role,
            process: row.process,
            level: row.level,
            ...(batchId ? { batchId } : {}),
          });
        }

        if (assignments.length > 0) {
          await tx.examAssignment.createMany({ data: assignments });
          results.created = assignments.length;
        }

        // Update user fields where needed (verification code, role)
        const updatePromises: Promise<unknown>[] = [];
        for (const { row, user } of matchedRows) {
          const updateData: Record<string, string | null> = {};
          if (row.verificationCode) {
            // New verification code provided → encrypt and store
            updateData.idCardLast6 = encryptMap.get(`${row.name}||${row.verificationCode}`) ?? '';
            results.codesUpdated++;
          } else if (user.idCardLast6 && isBcryptHash(user.idCardLast6)) {
            // No new code but user has legacy bcrypt hash → clear it
            updateData.idCardLast6 = null;
            results.codesCleared++;
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

    const msg = results.replaced > 0
      ? `覆盖导入 ${results.created} 人（替换 ${results.replaced} 人）`
      : `新增 ${results.created} 人`;

    const codeParts: string[] = [];
    if (results.usersCreated > 0) codeParts.push(`新建 ${results.usersCreated} 个用户`);
    if (results.codesUpdated > 0) codeParts.push(`更新 ${results.codesUpdated} 个验证码`);
    if (results.codesCleared > 0) codeParts.push(`清除 ${results.codesCleared} 个旧验证码`);

    console.log(`[participants-import] Results:`, results);

    return NextResponse.json({
      success: true,
      data: results,
      message: `${msg}${codeParts.length > 0 ? `，${codeParts.join('，')}` : ''}`,
    });
  } catch (error) {
    console.error('Import participants error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
