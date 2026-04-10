import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const faceRequestSchema = z.object({
  name: z.string().min(1, '请输入姓名'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = faceRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { name, isActive: true },
      select: {
        id: true,
        photoUrl: true,
        faceDescriptor: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: '员工不存在' },
        { status: 404 }
      );
    }

    if (!user.photoUrl || !user.faceDescriptor) {
      return NextResponse.json(
        { success: false, error: '该员工未录入人脸信息' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        photoUrl: user.photoUrl,
        faceDescriptor: user.faceDescriptor,
      },
    });
  } catch (error) {
    console.error('Face descriptor fetch error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
