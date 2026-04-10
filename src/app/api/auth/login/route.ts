import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { comparePassword, createAdminToken } from '@/lib/auth';
import { adminLoginSchema } from '@/lib/validators';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = adminLoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;

    // Verify against Admin table
    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin || !admin.isActive) {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    const isValid = await comparePassword(password, admin.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // Create JWT and set httpOnly cookie
    const token = await createAdminToken({
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
    });

    const cookieStore = await cookies();
    cookieStore.set('admin_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return NextResponse.json({
      success: true,
      data: {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
