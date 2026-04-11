import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { answerSaveSchema } from '@/lib/validators';

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
    const parsed = answerSaveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { sessionId, questionId, answerContent } = parsed.data;

    // Verify session belongs to this employee and is in progress
    const session = await prisma.examSession.findFirst({
      where: {
        id: sessionId,
        userId: employee.userId,
        status: 'IN_PROGRESS',
      },
      select: { id: true, questionOrder: true },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: '考试会话不存在或已结束' },
        { status: 404 }
      );
    }

    // Verify the question belongs to this exam session
    const questionOrder = session.questionOrder as string[] | null;
    if (questionOrder && Array.isArray(questionOrder) && !questionOrder.includes(questionId)) {
      return NextResponse.json(
        { success: false, error: '该题目不属于当前考试' },
        { status: 400 }
      );
    }

    const now = new Date();

    // Upsert answer record
    const answer = await prisma.answer.upsert({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId,
        },
      },
      create: {
        sessionId,
        questionId,
        answerContent,
        answeredAt: now,
      },
      update: {
        answerContent,
        answeredAt: now,
      },
    });

    // Update session lastActiveAt
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: now },
    });

    return NextResponse.json({
      success: true,
      data: {
        answerId: answer.id,
        savedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('Save answer error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
