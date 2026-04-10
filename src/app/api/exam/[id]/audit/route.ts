import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';
import { z } from 'zod';
import { Prisma, type AuditAction } from '@prisma/client';

const auditSchema = z.object({
  action: z.string().min(1, 'action 不能为空'),
  detail: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromCookie();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未登录或登录已过期' },
        { status: 401 }
      );
    }

    const { id: sessionId } = await params;

    const body = await request.json();
    const parsed = auditSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? '输入验证失败' },
        { status: 400 }
      );
    }

    const { action, detail, details } = parsed.data;

    // Verify session belongs to this employee
    const session = await prisma.examSession.findFirst({
      where: {
        id: sessionId,
        userId: employee.userId,
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: '考试会话不存在' },
        { status: 404 }
      );
    }

    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      null;

    // Create audit log entry
    const logDetails = details ?? (detail ? { detail } : undefined);
    await prisma.auditLog.create({
      data: {
        sessionId,
        action: action as AuditAction,
        details: logDetails
          ? (logDetails as Prisma.InputJsonValue)
          : Prisma.DbNull,
        ipAddress,
      },
    });

    // If TAB_SWITCH, update tab switch count on session
    if (action === 'TAB_SWITCH') {
      await prisma.examSession.update({
        where: { id: sessionId },
        data: {
          tabSwitchCount: { increment: 1 },
          lastActiveAt: new Date(),
        },
      });

      // Check if tab switch limit exceeded
      const exam = await prisma.exam.findUnique({
        where: { id: session.examId },
        select: { tabSwitchLimit: true },
      });

      const updatedSession = await prisma.examSession.findUnique({
        where: { id: sessionId },
        select: { tabSwitchCount: true },
      });

      if (
        exam &&
        updatedSession &&
        exam.tabSwitchLimit > 0 &&
        updatedSession.tabSwitchCount >= exam.tabSwitchLimit
      ) {
        return NextResponse.json({
          success: true,
          data: {
            logged: true,
            tabSwitchCount: updatedSession.tabSwitchCount,
            limitReached: true,
            message: '切屏次数已达上限，考试将自动提交',
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          logged: true,
          tabSwitchCount: updatedSession?.tabSwitchCount ?? 0,
          limitReached: false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { logged: true },
    });
  } catch (error) {
    console.error('Audit log error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
