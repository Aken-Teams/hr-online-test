import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyPassword, createEmployeeToken } from '@/lib/auth';
import { employeeVerifySchema } from '@/lib/validators';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = employeeVerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { name, password } = parsed.data;

    // Look up user by name
    const user = await prisma.user.findFirst({
      where: { name, isActive: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: '员工不存在或已停用' },
        { status: 401 }
      );
    }

    // Verify password (supports both bcrypt legacy and AES encrypted)
    if (!user.idCardLast6) {
      return NextResponse.json(
        { success: false, error: '该员工未设置密码，请联系管理员' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.idCardLast6);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: '密码错误' },
        { status: 401 }
      );
    }

    // Create JWT token and set cookie (no examId — employee picks from dashboard)
    const token = await createEmployeeToken({
      userId: user.id,
      name: user.name,
      department: user.department,
    });

    const cookieStore = await cookies();
    cookieStore.set('exam_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3 * 60 * 60, // 3 hours
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        employee: {
          id: user.id,
          employeeNo: user.employeeNo,
          name: user.name,
          department: user.department,
          role: user.role,
          photoUrl: user.photoUrl,
        },
      },
    });
  } catch (error) {
    console.error('Employee verify error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
