import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { generateEmployeesExcel } from '@/lib/excel';
import type { EmployeeExportRow } from '@/lib/excel';

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    // If examId given, export only employees assigned to that exam
    if (examId) {
      const assignments = await prisma.examAssignment.findMany({
        where: { examId },
        include: {
          user: { select: { employeeNo: true, name: true, department: true, role: true, isActive: true } },
        },
      });

      const rows: EmployeeExportRow[] = assignments
        .filter((a) => a.user)
        .map((a) => ({
          employeeNo: a.user!.employeeNo,
          name: a.user!.name,
          department: a.user!.department,
          role: a.user!.role,
          isActive: a.user!.isActive,
        }));

      // Deduplicate by employeeNo
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        if (seen.has(r.employeeNo)) return false;
        seen.add(r.employeeNo);
        return true;
      });

      unique.sort((a, b) => a.name.localeCompare(b.name));

      const buffer = generateEmployeesExcel(unique);

      await prisma.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'SCORE_EXPORTED',
          details: { type: 'employees', examId, exportedCount: unique.length },
        },
      });

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="employees-${Date.now()}.xlsx"`,
          'Content-Length': String(buffer.length),
        },
      });
    }

    // No examId — export all employees
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
    });

    const rows: EmployeeExportRow[] = users.map((u) => ({
      employeeNo: u.employeeNo,
      name: u.name,
      department: u.department,
      role: u.role,
      isActive: u.isActive,
    }));

    const buffer = generateEmployeesExcel(rows);

    await prisma.auditLog.create({
      data: {
        adminId: admin.adminId,
        action: 'SCORE_EXPORTED',
        details: { type: 'employees', examId: 'all', exportedCount: rows.length },
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="employees-${Date.now()}.xlsx"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Export employees error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
