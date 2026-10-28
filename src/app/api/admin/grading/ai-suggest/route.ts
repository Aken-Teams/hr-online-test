import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import { MANUAL_GRADE_TYPES } from '@/lib/constants';
import { isAiGradingEnabled, suggestShortAnswerGrades } from '@/lib/ai-grading';

/**
 * POST /api/admin/grading/ai-suggest  (PRD F3-2)
 *
 * 產生簡答題的 AI 建議分數並存入 answers.ai_*，供閱卷畫面預填。
 * 建議分數不會寫入 earned_points，也不會觸發成績結算 —— 一律等評卷人確認。
 *
 * Body:
 *   { answerIds: string[] }        指定作答
 *   { examId: string, limit?: n }  該場考試所有尚未產生建議的待閱卷作答
 */
export async function POST(request: Request) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    if (!isAiGradingEnabled()) {
      return NextResponse.json(
        { success: false, error: 'AI 辅助评分未启用，请改用人工评分' },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      answerIds?: string[];
      examId?: string;
      limit?: number;
      force?: boolean;
    };

    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);

    const answers = await prisma.answer.findMany({
      where: {
        ...(body.answerIds?.length
          ? { id: { in: body.answerIds } }
          : {
              session: {
                ...(body.examId ? { examId: body.examId } : {}),
                status: { in: ['SUBMITTED', 'GRADING', 'AUTO_SUBMITTED'] },
              },
              earnedPoints: null,
              ...(body.force ? {} : { aiScore: null }),
            }),
        question: { type: { in: MANUAL_GRADE_TYPES } },
        answerContent: { not: null },
      },
      take: limit,
      include: {
        question: {
          select: {
            content: true,
            points: true,
            referenceAnswer: true,
            gradingRubric: true,
          },
        },
        session: { select: { examId: true } },
      },
    });

    if (answers.length === 0) {
      return NextResponse.json({
        success: true,
        data: { requested: 0, suggested: 0, skipped: 0, results: [] },
      });
    }

    // 以該場考試的配分為滿分（題庫預設配分僅作為後備）
    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        OR: answers.map((a) => ({ examId: a.session.examId, questionId: a.questionId })),
      },
      select: { examId: true, questionId: true, points: true },
    });
    const pointsMap = new Map(
      examQuestions.map((eq) => [`${eq.examId}:${eq.questionId}`, eq.points])
    );

    const suggestions = await suggestShortAnswerGrades(answers, (a) => ({
      content: a.question.content,
      referenceAnswer: a.question.referenceAnswer,
      gradingRubric: a.question.gradingRubric,
      studentAnswer: a.answerContent,
      maxPoints: pointsMap.get(`${a.session.examId}:${a.questionId}`) ?? a.question.points,
    }));

    const now = new Date();
    const results: {
      answerId: string;
      aiScore: number | null;
      aiConfidence: string | null;
      aiReason: string | null;
    }[] = [];

    for (let i = 0; i < answers.length; i += 1) {
      const suggestion = suggestions[i];
      const answerId = answers[i].id;

      if (!suggestion) {
        // 無參考答案或 AI 異常 → 降級為全人工評分，不中斷流程
        results.push({ answerId, aiScore: null, aiConfidence: null, aiReason: null });
        continue;
      }

      await prisma.answer.update({
        where: { id: answerId },
        data: {
          aiScore: suggestion.score,
          aiReason: suggestion.reason,
          aiKeyPoints: suggestion.keyPoints as unknown as Prisma.InputJsonValue,
          aiConfidence: suggestion.confidence,
          aiModel: suggestion.model,
          aiGradedAt: now,
        },
      });

      results.push({
        answerId,
        aiScore: suggestion.score,
        aiConfidence: suggestion.confidence,
        aiReason: suggestion.reason,
      });
    }

    const suggested = results.filter((r) => r.aiScore !== null).length;

    return NextResponse.json({
      success: true,
      data: {
        requested: answers.length,
        suggested,
        skipped: answers.length - suggested,
        results,
      },
    });
  } catch (error) {
    console.error('AI suggest grading error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
