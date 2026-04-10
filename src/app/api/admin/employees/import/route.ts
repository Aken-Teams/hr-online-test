import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie, hashPassword } from '@/lib/auth';
import { parseEmployeeExcel } from '@/lib/excel';
import { MAX_UPLOAD_SIZE } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
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

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: '文件大小不能超过10MB' },
        { status: 400 }
      );
    }

    const validExtensions = ['.xls', '.xlsx'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(ext)) {
      return NextResponse.json(
        { success: false, error: '仅支持 .xls 和 .xlsx 格式' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseEmployeeExcel(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '未解析到有效员工数据' },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in batches to avoid overwhelming the database
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Hash idCardLast6 if provided
        const hashedIdCard = row.idCardLast6
          ? await hashPassword(row.idCardLast6)
          : undefined;

        const existing = await prisma.user.findUnique({
          where: { employeeNo: row.employeeNo },
        });

        if (existing) {
          // Update existing employee
          await prisma.user.update({
            where: { employeeNo: row.employeeNo },
            data: {
              name: row.name,
              department: row.department,
              subDepartment: row.subDepartment ?? null,
              role: row.role,
              hireDate: row.hireDate ? new Date(row.hireDate) : undefined,
              ...(hashedIdCard ? { idCardLast6: hashedIdCard } : {}),
            },
          });
          updated++;
        } else {
          // Create new employee
          await prisma.user.create({
            data: {
              employeeNo: row.employeeNo,
              name: row.name,
              idCardLast6: hashedIdCard ?? null,
              department: row.department,
              subDepartment: row.subDepartment ?? null,
              role: row.role,
              hireDate: row.hireDate ? new Date(row.hireDate) : null,
            },
          });
          created++;
        }
      } catch (err) {
        skipped++;
        const message = err instanceof Error ? err.message : '未知错误';
        errors.push(`第 ${i + 1} 行 (${row.employeeNo}): ${message}`);
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'EMPLOYEE_IMPORTED',
        details: {
          fileName: file.name,
          totalRows: rows.length,
          created,
          updated,
          skipped,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        created,
        updated,
        skipped,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      },
    });
  } catch (error) {
    console.error('Import employees error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
