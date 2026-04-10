import { prisma } from '@/lib/prisma';
import { shuffle } from '@/lib/utils';
import type { QuestionType } from '@prisma/client';

// ============================================================
// Types
// ============================================================

interface QuestionRule {
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  department?: string | null;
  level?: string | null;
  /** Ratio of "common" questions (department = '全公司'). 0..1 */
  commonRatio: number;
}

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
 * exam's question rules, the employee's department, and role.
 *
 * Algorithm per rule:
 * 1. Calculate how many "common" (全公司) vs "department-specific" questions
 *    to draw based on `commonRatio`.
 * 2. Query the database for eligible active questions matching type, level,
 *    department (or 全公司), and role.
 * 3. Shuffle the pool and pick the required count.
 * 4. If not enough department-specific questions, backfill from common pool
 *    (and vice versa).
 * 5. If still short, emit a warning and use whatever is available.
 */
export async function generateQuestionSet(
  examId: string,
  employeeDept: string,
  employeeRole: string
): Promise<GenerateResult> {
  // Load the exam and its rules
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { questionRules: true },
  });

  if (!exam) {
    throw new Error(`Exam not found: ${examId}`);
  }

  // Load all existing exam-question pairs for this exam to avoid duplicates
  const existingPairs = await prisma.examQuestion.findMany({
    where: { examId },
    select: { questionId: true },
  });
  const existingIds = new Set(existingPairs.map((eq) => eq.questionId));

  const allSelected: GeneratedQuestion[] = [];
  const selectedIds = new Set<string>();
  const warnings: string[] = [];
  let globalSortOrder = 0;

  for (const rule of exam.questionRules) {
    const picked = await pickQuestionsForRule(
      rule,
      employeeDept,
      employeeRole,
      existingIds,
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

async function pickQuestionsForRule(
  rule: QuestionRule,
  employeeDept: string,
  employeeRole: string,
  excludeIds: Set<string>,
  alreadySelected: Set<string>,
  warnings: string[]
): Promise<string[]> {
  const { questionType, count, department, level, commonRatio } = rule;

  // How many common vs department-specific
  const commonCount = Math.round(count * commonRatio);
  const deptCount = count - commonCount;

  // Build the "exclude" list (already used questions)
  const excludeArray = [...excludeIds, ...alreadySelected];

  // Fetch department-specific pool
  const deptPool = await fetchPool({
    type: questionType,
    department: department || employeeDept,
    role: employeeRole,
    level: level || undefined,
    excludeIds: excludeArray,
  });

  // Fetch common pool (全公司)
  const commonPool = await fetchPool({
    type: questionType,
    department: '全公司',
    role: employeeRole,
    level: level || undefined,
    excludeIds: excludeArray,
  });

  // Shuffle both pools
  const shuffledDept = shuffle(deptPool);
  const shuffledCommon = shuffle(commonPool);

  // Pick from each pool
  const pickedDept = shuffledDept.slice(0, deptCount);
  const pickedCommon = shuffledCommon.slice(0, commonCount);

  // Calculate shortfalls and backfill
  const deptShortfall = deptCount - pickedDept.length;
  const commonShortfall = commonCount - pickedCommon.length;

  const result = [...pickedDept, ...pickedCommon];
  const usedIds = new Set(result);

  // Backfill department shortfall from common pool
  if (deptShortfall > 0) {
    const remainingCommon = shuffledCommon.filter((id) => !usedIds.has(id));
    const backfill = remainingCommon.slice(0, deptShortfall);
    for (const id of backfill) {
      result.push(id);
      usedIds.add(id);
    }
  }

  // Backfill common shortfall from department pool
  if (commonShortfall > 0) {
    const remainingDept = shuffledDept.filter((id) => !usedIds.has(id));
    const backfill = remainingDept.slice(0, commonShortfall);
    for (const id of backfill) {
      result.push(id);
      usedIds.add(id);
    }
  }

  // Final shortfall check -- try a broader search (any role)
  if (result.length < count) {
    const stillNeeded = count - result.length;
    const broadPool = await fetchPool({
      type: questionType,
      department: department || employeeDept,
      level: level || undefined,
      excludeIds: [...excludeArray, ...result],
    });
    const broadCommon = await fetchPool({
      type: questionType,
      department: '全公司',
      level: level || undefined,
      excludeIds: [...excludeArray, ...result],
    });
    const combined = shuffle([...broadPool, ...broadCommon]);
    const unique = combined.filter((id) => !usedIds.has(id));
    const fallback = unique.slice(0, stillNeeded);
    for (const id of fallback) {
      result.push(id);
      usedIds.add(id);
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
  department: string;
  role?: string;
  level?: string;
  excludeIds: string[];
}

/**
 * Fetch IDs of active questions matching the given criteria.
 */
async function fetchPool(params: FetchPoolParams): Promise<string[]> {
  const where: Record<string, unknown> = {
    type: params.type,
    department: params.department,
    isActive: true,
  };

  if (params.role) {
    where.role = params.role;
  }

  if (params.level) {
    where.level = params.level;
  }

  if (params.excludeIds.length > 0) {
    where.id = { notIn: params.excludeIds };
  }

  const questions = await prisma.question.findMany({
    where,
    select: { id: true },
  });

  return questions.map((q) => q.id);
}
