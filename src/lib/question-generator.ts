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
      warnings
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
  warnings: string[]
): Promise<string[]> {
  const { questionType, count } = rule;

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

  // ---- Primary: this exam's own imported questions (examSourceId) ----
  // BASIC is company-wide (not filtered by process/level); PROFESSIONAL is
  // filtered by department + process + level.
  const basicSrc = await fetchPool({
    type: questionType,
    category: 'BASIC',
    examSourceId: examId,
    excludeIds: excludeArray,
  });
  take(basicSrc, basicCount, true);

  const profSrc = await fetchPool({
    type: questionType,
    category: 'PROFESSIONAL',
    department: employeeDept,
    process: process || undefined,
    level: level || undefined,
    examSourceId: examId,
    excludeIds: excludeArray,
  });
  take(profSrc, professionalCount, false);

  // ---- Fallback: draw from the whole bank (ignore examSourceId) ----
  // This is what makes "skip upload → use existing bank" work. BASIC questions
  // are company-wide (process is null), so they must be fetched WITHOUT the
  // process/level filter, otherwise they would never be drawn.
  if (basicFilled < basicCount) {
    const globalBasic = await fetchPool({
      type: questionType,
      category: 'BASIC',
      excludeIds: [...excludeArray, ...result],
    });
    take(globalBasic, basicCount - basicFilled, true);
  }

  if (profFilled < professionalCount) {
    const globalProf = await fetchPool({
      type: questionType,
      category: 'PROFESSIONAL',
      department: employeeDept,
      process: process || undefined,
      level: level || undefined,
      excludeIds: [...excludeArray, ...result],
    });
    take(globalProf, professionalCount - profFilled, false);
  }

  // ---- Last resort: fill any remaining shortfall cross-category ----
  // Prefer professional (process+level), then company-wide basic, then a broad
  // process-only search, so the paper still reaches `count` where possible.
  if (result.length < count) {
    const extraProf = await fetchPool({
      type: questionType,
      category: 'PROFESSIONAL',
      department: employeeDept,
      process: process || undefined,
      level: level || undefined,
      excludeIds: [...excludeArray, ...result],
    });
    take(extraProf, count - result.length, false);
  }
  if (result.length < count) {
    const extraBasic = await fetchPool({
      type: questionType,
      category: 'BASIC',
      excludeIds: [...excludeArray, ...result],
    });
    take(extraBasic, count - result.length, true);
  }
  if (result.length < count) {
    const broadPool = await fetchPool({
      type: questionType,
      department: employeeDept,
      process: process || undefined,
      level: level || undefined,
      excludeIds: [...excludeArray, ...result],
    });
    take(broadPool, count - result.length, false);
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

  if (params.examSourceId) {
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
