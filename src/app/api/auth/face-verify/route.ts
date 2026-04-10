import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { createEmployeeToken } from '@/lib/auth';
import { z } from 'zod';

const faceVerifySchema = z.object({
  name: z.string().min(1, '请输入姓名'),
  faceVerified: z.literal(true),
});

/**
 * POST /api/auth/face-verify
 * Authenticate employee via face recognition (client-side verified).
 * The actual face comparison happens client-side using face-api.js.
 * This endpoint issues a token after confirming the employee exists
 * and has a face descriptor registered.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = faceVerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

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

    // Verify that the user has a face descriptor registered
    if (!user.faceDescriptor) {
      return NextResponse.json(
        { success: false, error: '该员工未录入人脸信息' },
        { status: 401 }
      );
    }

    // Find assigned exam
    const now = new Date();
    const assignment = await prisma.examAssignment.findFirst({
      where: {
        exam: {
          status: { in: ['PUBLISHED', 'ACTIVE'] },
          OR: [
            { openAt: null },
            { openAt: { lte: now } },
          ],
          AND: [
            {
              OR: [
                { closeAt: null },
                { closeAt: { gte: now } },
              ],
            },
          ],
        },
        OR: [
          { userId: user.id },
          { department: user.department, role: user.role },
          { department: user.department, role: null },
        ],
      },
      include: {
        exam: true,
      },
      orderBy: {
        exam: { createdAt: 'desc' },
      },
    });

    const examId = assignment?.examId ?? undefined;

    // Create JWT token and set cookie
    const token = await createEmployeeToken({
      userId: user.id,
      name: user.name,
      department: user.department,
      examId,
    });

    const cookieStore = await cookies();
    cookieStore.set('exam_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3 * 60 * 60,
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
          examId,
          enableFaceAuth: assignment?.exam?.enableFaceAuth ?? false,
        },
      },
    });
  } catch (error) {
    console.error('Face verify error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
