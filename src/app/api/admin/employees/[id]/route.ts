import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { z } from 'zod';

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  employeeNo: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  role: z.string().optional(),
  faceDescriptor: z.array(z.number()).length(128).optional(),
});

/**
 * GET /api/admin/employees/[id]
 * Return employee detail with exam assignments and historical scores.
 */
export async function GET(
  _request: Request,
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

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        employeeNo: true,
        name: true,
        department: true,
        subDepartment: true,
        role: true,
        photoUrl: true,
        hireDate: true,
        isActive: true,
        createdAt: true,
        examAssignments: {
          select: {
            id: true,
            process: true,
            level: true,
            exam: {
              select: {
                id: true,
                title: true,
                status: true,
                createdAt: true,
                theoryWeight: true,
                practicalWeight: true,
                compositePassScore: true,
              },
            },
          },
          orderBy: { exam: { createdAt: 'desc' } },
        },
        examSessions: {
          where: { status: { in: ['SUBMITTED', 'COMPLETED'] } },
          select: {
            id: true,
            examId: true,
            assignmentId: true,
            attemptNumber: true,
            status: true,
            submittedAt: true,
            exam: { select: { id: true, title: true } },
            assignment: { select: { process: true, level: true } },
            result: {
              select: {
                autoScore: true,
                maxPossibleScore: true,
                practicalScore: true,
                combinedScore: true,
                isPassed: true,
                totalScore: true,
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: '员工不存在' },
        { status: 404 }
      );
    }

    // Build a map of examId -> exam info from assignments
    const examMap = new Map<string, { title: string; process: string | null; level: string | null }>();
    for (const a of user.examAssignments) {
      examMap.set(a.exam.id, {
        title: a.exam.title,
        process: a.process,
        level: a.level,
      });
    }

    const assignments = user.examAssignments.map((a) => ({
      id: a.id,
      examId: a.exam.id,
      examTitle: a.exam.title,
      examStatus: a.exam.status,
      process: a.process,
      level: a.level,
      examCreatedAt: a.exam.createdAt,
    }));

    const sessions = user.examSessions.map((s) => {
      const info = examMap.get(s.examId);
      return {
        sessionId: s.id,
        examId: s.examId,
        examTitle: s.exam.title ?? info?.title ?? '—',
        process: s.assignment?.process ?? info?.process ?? null,
        level: s.assignment?.level ?? info?.level ?? null,
        attemptNumber: s.attemptNumber,
        status: s.status,
        submittedAt: s.submittedAt,
        autoScore: s.result?.autoScore ?? 0,
        maxPossibleScore: s.result?.maxPossibleScore ?? 0,
        practicalScore: s.result?.practicalScore ?? null,
        combinedScore: s.result?.combinedScore ?? null,
        isPassed: s.result?.isPassed ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        employeeNo: user.employeeNo,
        name: user.name,
        department: user.department,
        subDepartment: user.subDepartment,
        role: user.role,
        photoUrl: user.photoUrl,
        hireDate: user.hireDate,
        isActive: user.isActive,
        createdAt: user.createdAt,
        assignments,
        sessions,
      },
    });
  } catch (error) {
    console.error('Get employee detail error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/employees/[id]
 * Update employee fields (currently supports faceDescriptor).
 */
export async function PATCH(
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

    const { id } = await params;
    const body = await request.json();
    const parsed = updateEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.employeeNo !== undefined) data.employeeNo = parsed.data.employeeNo;
    if (parsed.data.department !== undefined) data.department = parsed.data.department;
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.faceDescriptor) data.faceDescriptor = parsed.data.faceDescriptor;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: '没有需要更新的数据' },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, employeeNo: true, department: true, role: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update employee error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/employees/[id]
 * Soft-delete (deactivate) if employee has exam sessions,
 * hard-delete if no exam history exists.
 */
export async function DELETE(
  _request: Request,
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

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: { select: { examSessions: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: '员工不存在' },
        { status: 404 }
      );
    }

    if (user._count.examSessions > 0) {
      // Has exam history → soft-delete (deactivate)
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      await prisma.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'EMPLOYEE_DEACTIVATED',
          details: { userId: id, name: user.name },
        },
      });

      return NextResponse.json({
        success: true,
        data: { deleted: false, deactivated: true, message: '该员工有考试记录，已设为停用' },
      });
    }

    // No exam history → hard-delete (remove assignments first)
    await prisma.$transaction(async (tx) => {
      await tx.examAssignment.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminId: admin.adminId,
          action: 'EMPLOYEE_DELETED',
          details: { userId: id, name: user.name },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true, deactivated: false },
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
