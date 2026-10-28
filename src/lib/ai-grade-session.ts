import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MANUAL_GRADE_TYPES } from '@/lib/constants';
import { isAiGradingEnabled, suggestShortAnswerGrades } from '@/lib/ai-grading';

/**
 * 为某场 session 的「待评分简答题」生成 AI 初评建议，写入 answers.ai_*。
 *
 * - 只写 ai_*（建议分数/理由/关键点/信心/模型），不写 earned_points、不结算成绩
 *   —— 最终分数一律以评卷人确认为准。
 * - 本地优先、云端后备由 ai-grading 的 provider chain 自动处理。
 * - 用于「交卷后自动初评」：考生交卷即触发（fire-and-forget），评卷人进来即可看到建议。
 */
export async function generateAiSuggestionsForSession(
  sessionId: string
): Promise<{ suggested: number }> {
  if (!isAiGradingEnabled()) return { suggested: 0 };

  const answers = await prisma.answer.findMany({
    where: {
      sessionId,
      earnedPoints: null,
      aiScore: null,
      question: { type: { in: MANUAL_GRADE_TYPES } },
      answerContent: { not: null },
    },
    include: {
      question: {
        select: { content: true, points: true, referenceAnswer: true, gradingRubric: true },
      },
      session: { select: { examId: true } },
    },
  });
  if (answers.length === 0) return { suggested: 0 };

  // 以该场考试的配分为满分（题库预设配分仅作后备）
  const examQuestions = await prisma.examQuestion.findMany({
    where: { OR: answers.map((a) => ({ examId: a.session.examId, questionId: a.questionId })) },
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
  let suggested = 0;
  for (let i = 0; i < answers.length; i += 1) {
    const s = suggestions[i];
    if (!s) continue; // 无参考答案或 AI 异常 → 降级为全人工，不中断
    await prisma.answer.update({
      where: { id: answers[i].id },
      data: {
        aiScore: s.score,
        aiReason: s.reason,
        aiKeyPoints: s.keyPoints as unknown as Prisma.InputJsonValue,
        aiConfidence: s.confidence,
        aiModel: s.model,
        aiGradedAt: now,
      },
    });
    suggested += 1;
  }
  return { suggested };
}
