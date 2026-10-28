import { prisma } from '@/lib/prisma';
import { shuffle } from '@/lib/utils';
import type { QuestionType } from '@prisma/client';

// ============================================================
// Types
// ============================================================

interface GeneratedQuestion {
  questionId: string;
  points: number;
  sortOrder: number;
}

interface GenerateResult {
  questions: GeneratedQuestion[];
  warnings: string[];
}

// ============================================================
// Main generator
// ============================================================

/**
 * Generate a set of exam questions for a specific employee based on the
 * exam's question rules, the employee's department, process, and level.
 *
 * Algorithm per rule:
 * 1. Calculate how many BASIC vs PROFESSIONAL questions to draw
 *    based on `exam.basicQuestionRatio` (default 10%).
 * 2. BASIC questions: filtered by type + category=BASIC + examSourceId=examId
 *    (common questions, not filtered by process/level)
 * 3. PROFESSIONAL questions: filtered by type + category=PROFESSIONAL
 *    + process + level + examSourceId=examId
 * 4. Backfill if one pool is short from the other.
 * 5. If still short, try broader search (without examSourceId constraint).
 */
export async function generateQuestionSet(
  examId: string,
  employeeDept: string,
  process?: string | null,
  level?: string | null
): Promise<GenerateResult> {
  // Load the exam and its rules
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { questionRules: true },
  });

  if (!exam) {
    throw new Error(`Exam not found: ${examId}`);
  }

  const basicRatio = exam.basicQuestionRatio; // default 0.1

  // 判断本场是否为「上传型考试」：有本场独有题（examSourceId=examId）或关联的中央题。
  // 上传型 → 只从「本场独有 + 关联中央」抽；非上传型 → 从整个中央题库按工序+级别抽。
  const [exclusiveCount, links] = await Promise.all([
    prisma.question.count({ where: { examSourceId: examId } }),
    prisma.examSourceQuestion.findMany({ where: { examId }, select: { questionId: true } }),
  ]);
  const linkedCentralIds = links.map((l) => l.questionId);
  const hasUpload = exclusiveCount > 0 || linkedCentralIds.length > 0;

  // NOTE: We do NOT exclude questions already in exam_questions table.
  // That table is shared across all users, so excluding them would cause
  // later users to run out of questions. The createMany+skipDuplicates
  // in the start route handles dedup at the DB level.

  const allSelected: GeneratedQuestion[] = [];
  const selectedIds = new Set<string>();
  const warnings: string[] = [];
  let globalSortOrder = 0;

  for (const rule of exam.questionRules) {
    const picked = await pickQuestionsForRule(
      rule,
      examId,
      employeeDept,
      process,
      level,
      basicRatio,
      selectedIds,
      warnings,
      hasUpload,
      linkedCentralIds
    );

    for (const qId of picked) {
      selectedIds.add(qId);
      allSelected.push({
        questionId: qId,
        points: rule.pointsPerQuestion,
        sortOrder: globalSortOrder++,
      });
    }
  }

  return { questions: allSelected, warnings };
}

// ============================================================
// Internal helpers
// ============================================================

interface QuestionRule {
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  department?: string | null;
  level?: string | null;
  commonRatio: number;
}

async function pickQuestionsForRule(
  rule: QuestionRule,
  examId: string,
  employeeDept: string,
  process: string | null | undefined,
  level: string | null | undefined,
  basicRatio: number,
  alreadySelected: Set<string>,
  warnings: string[],
  hasUpload: boolean,
  linkedCentralIds: string[]
): Promise<string[]> {
  const { questionType, count } = rule;

  // 专业题的「题库部门」：优先用考试规则指定的部门（rule.department），
  // 没设才退回考生的部门（employeeDept）。这样一场「工务部 SAW Ⅰ级」考试
  // 只会抽工务部的切割题，不会混到同工序其他部门（如生产部贴膜题）。
  // 基础题(BASIC)为全公司共用，不卡部门。
  const bankDept = rule.department || employeeDept || undefined;

  // Calculate BASIC vs PROFESSIONAL split
  const basicCount = Math.round(count * basicRatio);
  const professionalCount = count - basicCount;

  // Only exclude questions already selected within THIS user's set
  const excludeArray = [...alreadySelected];

  const result: string[] = [];
  const usedIds = new Set<string>();
  let basicFilled = 0;
  let profFilled = 0;

  // Take up to `n` ids from a pool, tracking whether they fill basic or
  // professional slots. Skips ids already used.
  const take = (pool: string[], n: number, asBasic: boolean) => {
    for (const id of shuffle(pool)) {
      if (n <= 0) break;
      if (usedIds.has(id)) continue;
      result.push(id);
      usedIds.add(id);
      if (asBasic) basicFilled++;
      else profFilled++;
      n--;
    }
  };

  if (hasUpload) {
    // ── 上传型考试：只用「本场独有题 + 关联的中央题」，不向整个中央外溢 ──
    const restrict = { examId, linkedIds: linkedCentralIds };
    // BASIC 全公司共用（不卡工序/级别）；PROFESSIONAL 卡工序+级别。
    const basicPool = await fetchPool({
      type: questionType,
      category: 'BASIC',
      restrict,
      excludeIds: excludeArray,
    });
    take(basicPool, basicCount, true);

    const profPool = await fetchPool({
      type: questionType,
      category: 'PROFESSIONAL',
      department: bankDept,
      process: process || undefined,
      level: level || undefined,
      restrict,
      excludeIds: excludeArray,
    });
    take(profPool, professionalCount, false);

    // 本场内 基本<->专业 互相补足（仍限本场的池，不撈其他中央）
    if (basicFilled < basicCount) take(profPool, basicCount - basicFilled, true);
    if (profFilled < professionalCount) take(basicPool, professionalCount - profFilled, false);
  } else {
    // ── 非上传型考试：从整个中央题库按工序+级别抽 ──
    const basicSrc = await fetchPool({
      type: questionType,
      category: 'BASIC',
      excludeIds: excludeArray,
    });
    take(basicSrc, basicCount, true);

    const profSrc = await fetchPool({
      type: questionType,
      category: 'PROFESSIONAL',
      department: bankDept,
      process: process || undefined,
      level: level || undefined,
      excludeIds: excludeArray,
    });
    take(profSrc, professionalCount, false);

    // 跨类别补足
    if (basicFilled < basicCount) {
      const more = await fetchPool({
        type: questionType,
        category: 'PROFESSIONAL',
        department: bankDept,
        process: process || undefined,
        level: level || undefined,
        excludeIds: [...excludeArray, ...result],
      });
      take(more, basicCount - basicFilled, true);
    }
    if (profFilled < professionalCount) {
      const moreBasic = await fetchPool({
        type: questionType,
        category: 'BASIC',
        excludeIds: [...excludeArray, ...result],
      });
      take(moreBasic, professionalCount - profFilled, false);
    }
    // 最后保底：同部门内按工序放宽到不分类别（仍不跨部门，避免混到别的题库）
    if (result.length < count) {
      const broadPool = await fetchPool({
        type: questionType,
        department: bankDept,
        process: process || undefined,
        level: level || undefined,
        excludeIds: [...excludeArray, ...result],
      });
      take(broadPool, count - result.length, false);
    }
  }

  if (result.length < count) {
    warnings.push(
      `${questionType}: 需要 ${count} 题，但仅找到 ${result.length} 题可用`
    );
  }

  return result;
}

interface FetchPoolParams {
  type: QuestionType;
  category?: string;
  department?: string;
  process?: string;
  level?: string;
  examSourceId?: string;
  /** 上传型考试：限定在「本场独有题(examSourceId) + 关联的中央题(linkedIds)」内 */
  restrict?: { examId: string; linkedIds: string[] };
  excludeIds: string[];
}

/**
 * Fetch IDs of active questions matching the given criteria.
 */
async function fetchPool(params: FetchPoolParams): Promise<string[]> {
  const where: Record<string, unknown> = {
    type: params.type,
    isActive: true,
  };

  if (params.category) {
    where.category = params.category;
  }

  if (params.department) {
    where.department = params.department;
  }

  if (params.process) {
    where.process = params.process;
  }

  if (params.level) {
    where.level = params.level;
  }

  if (params.restrict) {
    const { examId, linkedIds } = params.restrict;
    where.OR = linkedIds.length > 0
      ? [{ examSourceId: examId }, { id: { in: linkedIds } }]
      : [{ examSourceId: examId }];
  } else if (params.examSourceId) {
    where.examSourceId = params.examSourceId;
  }

  if (params.excludeIds.length > 0) {
    where.id = { notIn: params.excludeIds };
  }

  const questions = await prisma.question.findMany({
    where,
    select: { id: true },
    distinct: ['content'],
  });

  return questions.map((q) => q.id);
}
