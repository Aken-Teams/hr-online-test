import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { z } from 'zod';

const flagSchema = z.object({
  sessionId: z.string().min(1, 'sessionId 不能为空'),
  questionId: z.string().min(1, 'questionId 不能为空'),
});

export async function POST(request: Request) {
  try {
    const employee = await getEmployeeFromCookie();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未登录或登录已过期' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = flagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { sessionId, questionId } = parsed.data;

    // Verify session belongs to this employee and is in progress
    const session = await prisma.examSession.findFirst({
      where: {
        id: sessionId,
        userId: employee.userId,
        status: 'IN_PROGRESS',
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: '考试会话不存在或已结束' },
        { status: 404 }
      );
    }

    // Upsert the answer record and toggle the flag
    const existing = await prisma.answer.findUnique({
      where: {
        sessionId_questionId: { sessionId, questionId },
      },
    });

    const newFlagged = existing ? !existing.isFlagged : true;

    const answer = await prisma.answer.upsert({
      where: {
        sessionId_questionId: { sessionId, questionId },
      },
      create: {
        sessionId,
        questionId,
        isFlagged: true,
      },
      update: {
        isFlagged: newFlagged,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        questionId,
        isFlagged: answer.isFlagged,
      },
    });
  } catch (error) {
    console.error('Flag question error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
