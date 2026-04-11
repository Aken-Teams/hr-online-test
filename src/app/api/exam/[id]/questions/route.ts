import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmployeeFromCookie } from '@/lib/auth';

export async function GET(
  _request: Request,
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

    const { id: examId } = await params;

    // Find active session for this employee and exam
    const session = await prisma.examSession.findFirst({
      where: {
        examId,
        userId: employee.userId,
        status: 'IN_PROGRESS',
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: '没有进行中的考试会话' },
        { status: 404 }
      );
    }

    // Load this session's questions (scoped by questionOrder)
    const questionOrder = session.questionOrder as string[] | null;
    const sessionQuestionIds = questionOrder && Array.isArray(questionOrder) ? questionOrder : [];

    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        examId,
        ...(sessionQuestionIds.length > 0 ? { questionId: { in: sessionQuestionIds } } : {}),
      },
      include: {
        question: {
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    // Load existing answers
    const answers = await prisma.answer.findMany({
      where: { sessionId: session.id },
      select: {
        questionId: true,
        answerContent: true,
        isFlagged: true,
      },
    });

    // Re-order based on stored questionOrder
    const orderArray = session.questionOrder as string[] | null;
    let orderedQuestions = examQuestions;
    if (orderArray && Array.isArray(orderArray)) {
      const orderMap = new Map(orderArray.map((id, idx) => [id, idx]));
      orderedQuestions = [...examQuestions].sort((a, b) => {
        const aIdx = orderMap.get(a.questionId) ?? a.sortOrder;
        const bIdx = orderMap.get(b.questionId) ?? b.sortOrder;
        return aIdx - bIdx;
      });
    }

    // Return questions without correct answers
    const questions = orderedQuestions.map((eq, idx) => ({
      id: eq.question.id,
      type: eq.question.type,
      content: eq.question.content,
      points: eq.points,
      isMultiSelect: eq.question.isMultiSelect,
      options: eq.question.options.map((o) => ({
        label: o.label,
        content: o.content,
      })),
      sortOrder: idx,
    }));

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        startedAt: session.startedAt,
        questions,
        answers,
      },
    });
  } catch (error) {
    console.error('Get questions error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
