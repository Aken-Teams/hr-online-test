import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie, encryptValue } from '@/lib/auth';
import { employeeImportSchema } from '@/lib/validators';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)));
    const department = searchParams.get('department');
    const role = searchParams.get('role');
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');
    const examId = searchParams.get('examId');

    const where: Record<string, unknown> = {};

    if (department) {
      where.department = department;
    }
    if (role) {
      where.role = { contains: role };
    }
    if (isActive !== null && isActive !== '') {
      where.isActive = isActive === 'true';
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { employeeNo: { contains: search } },
      ];
    }
    if (examId) {
      where.examAssignments = { some: { examId } };
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          employeeNo: true,
          name: true,
          department: true,
          subDepartment: true,
          role: true,
          photoUrl: true,
          faceDescriptor: true,
          hireDate: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: { examSessions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    const employees = items.map((u) => ({
      id: u.id,
      employeeNo: u.employeeNo,
      name: u.name,
      department: u.department,
      subDepartment: u.subDepartment,
      role: u.role,
      photoUrl: u.photoUrl,
      hasFaceDescriptor: u.faceDescriptor != null,
      hireDate: u.hireDate,
      isActive: u.isActive,
      sessionCount: u._count.examSessions,
      createdAt: u.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        items: employees,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('List employees error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: '未登录或无权限' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = employeeImportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check for duplicate employeeNo
    const existing = await prisma.user.findUnique({
      where: { employeeNo: data.employeeNo },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `工号 ${data.employeeNo} 已存在` },
        { status: 409 }
      );
    }

    // Encrypt idCardLast6 if provided
    const encryptedIdCard = data.idCardLast6
      ? encryptValue(data.idCardLast6)
      : null;

    const user = await prisma.user.create({
      data: {
        employeeNo: data.employeeNo,
        name: data.name,
        idCardLast6: encryptedIdCard,
        department: data.department,
        subDepartment: data.subDepartment ?? null,
        role: data.role,
        hireDate: data.hireDate ? new Date(data.hireDate) : null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: user.id,
          employeeNo: user.employeeNo,
          name: user.name,
          department: user.department,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create employee error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
