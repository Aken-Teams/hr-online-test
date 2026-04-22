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
      examId,
      employeeDept,
      process,
      level,
      basicRatio,
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
  excludeIds: Set<string>,
  alreadySelected: Set<string>,
  warnings: string[]
): Promise<string[]> {
  const { questionType, count } = rule;

  // Calculate BASIC vs PROFESSIONAL split
  const basicCount = Math.round(count * basicRatio);
  const professionalCount = count - basicCount;

  const excludeArray = [...excludeIds, ...alreadySelected];

  // Fetch BASIC pool (not filtered by process/level, only by exam source)
  const basicPool = await fetchPool({
    type: questionType,
    category: 'BASIC',
    examSourceId: examId,
    excludeIds: excludeArray,
  });

  // Fetch PROFESSIONAL pool (filtered by process + level)
  const professionalPool = await fetchPool({
    type: questionType,
    category: 'PROFESSIONAL',
    process: process || undefined,
    level: level || undefined,
    examSourceId: examId,
    excludeIds: excludeArray,
  });

  const shuffledBasic = shuffle(basicPool);
  const shuffledProfessional = shuffle(professionalPool);

  const pickedBasic = shuffledBasic.slice(0, basicCount);
  const pickedProfessional = shuffledProfessional.slice(0, professionalCount);

  const result = [...pickedBasic, ...pickedProfessional];
  const usedIds = new Set(result);

  // Backfill basic shortfall from professional pool
  const basicShortfall = basicCount - pickedBasic.length;
  if (basicShortfall > 0) {
    const remaining = shuffledProfessional.filter((id) => !usedIds.has(id));
    const backfill = remaining.slice(0, basicShortfall);
    for (const id of backfill) {
      result.push(id);
      usedIds.add(id);
    }
  }

  // Backfill professional shortfall from basic pool
  const professionalShortfall = professionalCount - pickedProfessional.length;
  if (professionalShortfall > 0) {
    const remaining = shuffledBasic.filter((id) => !usedIds.has(id));
    const backfill = remaining.slice(0, professionalShortfall);
    for (const id of backfill) {
      result.push(id);
      usedIds.add(id);
    }
  }

  // Final fallback: broader search without examSourceId constraint
  if (result.length < count) {
    const stillNeeded = count - result.length;
    const broadBasic = await fetchPool({
      type: questionType,
      category: 'BASIC',
      department: employeeDept,
      excludeIds: [...excludeArray, ...result],
    });
    const broadProfessional = await fetchPool({
      type: questionType,
      category: 'PROFESSIONAL',
      department: employeeDept,
      process: process || undefined,
      level: level || undefined,
      excludeIds: [...excludeArray, ...result],
    });
    const combined = shuffle([...broadBasic, ...broadProfessional]);
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
  });

  return questions.map((q) => q.id);
}
