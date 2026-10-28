import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromCookie } from '@/lib/auth';
import type { QuestionType } from '@prisma/client';

/**
 * GET /api/admin/exams/[id]/question-pool-preview
 *
 * 预览抽题池：对本场考试的每条题目规则，按「已指派考生的每个 工序 + 级别」组合，
 * 计算可用题数 vs 需要题数，让管理员在开考前知道「这场每工序能从几题里抽几题」。
 *
 * 可用题数 ≈ 专业题(该工序+级别) + 基本题(全公司共用)，与抽题引擎一致。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromCookie();
    if (!admin) {
      return NextResponse.json({ success: false, error: '未登录或无权限' }, { status: 401 });
    }

    const { id: examId } = await params;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: {
        basicQuestionRatio: true,
        questionRules: { select: { questionType: true, count: true } },
      },
    });
    if (!exam) {
      return NextResponse.json({ success: false, error: '考试不存在' }, { status: 404 });
    }

    // 已指派考生的 工序+级别 组合（去重）
    const assignments = await prisma.examAssignment.findMany({
      where: { examId },
      select: { process: true, level: true },
    });
    const comboKey = (p: string | null, l: string | null) => `${p ?? ''}|||${l ?? ''}`;
    const comboMap = new Map<string, { process: string | null; level: string | null }>();
    for (const a of assignments) {
      comboMap.set(comboKey(a.process, a.level), { process: a.process, level: a.level });
    }
    const combos = [...comboMap.values()];

    const basicRatio = exam.basicQuestionRatio ?? 0.1;

    // 每个 (type) 的基本题池大小（全公司共用，与工序无关）可缓存
    const basicAvailCache = new Map<string, number>();
    async function basicAvail(type: QuestionType): Promise<number> {
      const key = String(type);
      if (basicAvailCache.has(key)) return basicAvailCache.get(key)!;
      const n = await prisma.question.count({
        where: { isActive: true, type, category: 'BASIC' },
      });
      basicAvailCache.set(key, n);
      return n;
    }

    const result = [];
    for (const combo of combos) {
      const ruleRows = [];
      for (const rule of exam.questionRules) {
        const type = rule.questionType;
        const needed = rule.count;
        const basicNeeded = Math.round(needed * basicRatio);
        const profNeeded = needed - basicNeeded;

        const profAvail = await prisma.question.count({
          where: {
            isActive: true,
            type,
            category: 'PROFESSIONAL',
            process: combo.process || undefined,
            level: combo.level || undefined,
          },
        });
        const bAvail = await basicAvail(type);
        const available = profAvail + bAvail;

        ruleRows.push({
          type,
          needed,
          basicNeeded,
          profNeeded,
          profAvail,
          basicAvail: bAvail,
          available,
          sufficient: available >= needed && profAvail >= profNeeded,
        });
      }
      result.push({ process: combo.process, level: combo.level, rules: ruleRows });
    }

    return NextResponse.json({
      success: true,
      data: {
        hasParticipants: combos.length > 0,
        basicRatioPercent: Math.round(basicRatio * 100),
        combos: result,
      },
    });
  } catch (error) {
    console.error('Question pool preview error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
