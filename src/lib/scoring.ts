import type { QuestionType } from '@prisma/client';
import { GRADE_THRESHOLDS, AUTO_GRADABLE_TYPES } from '@/lib/constants';
import type {
  ExamResultData,
  CategoryScore,
  CategoryScoreMap,
} from '@/types/exam';

// ============================================================
// Types used by the scoring module
// ============================================================

interface QuestionForGrading {
  id: string;
  type: QuestionType;
  correctAnswer: string | null;
  isMultiSelect: boolean;
  points: number;
}

interface AnswerForGrading {
  id: string;
  questionId: string;
  answerContent: string | null;
  isCorrect?: boolean | null;
  earnedPoints?: number | null;
}

interface SessionForScoring {
  id: string;
  examId: string;
  startedAt: Date | string | null;
  submittedAt: Date | string | null;
}

interface ExamForScoring {
  passScore: number;
  totalScore: number;
}

export interface AutoGradeResult {
  isCorrect: boolean;
  earnedPoints: number;
}

// ============================================================
// Auto-grading for objective questions
// ============================================================

/**
 * Auto-grade a single answer for MC (single/multi) or True/False questions.
 *
 * - SINGLE_CHOICE / TRUE_FALSE: exact match on correctAnswer (case-insensitive, trimmed).
 * - MULTI_CHOICE: user's comma-separated selections must match correctAnswer set exactly.
 *
 * Returns null for question types that require manual grading.
 */
export function autoGradeAnswer(
  question: QuestionForGrading,
  userAnswer: string | null
): AutoGradeResult | null {
  if (!AUTO_GRADABLE_TYPES.includes(question.type)) {
    return null;
  }

  if (!userAnswer || userAnswer.trim() === '') {
    return { isCorrect: false, earnedPoints: 0 };
  }

  if (!question.correctAnswer || question.correctAnswer.trim() === '') {
    // No correct answer defined -- cannot auto-grade
    return null;
  }

  const correct = question.correctAnswer.trim().toUpperCase();
  const given = userAnswer.trim().toUpperCase();

  if (question.type === 'SINGLE_CHOICE' || question.type === 'TRUE_FALSE') {
    const isCorrect = given === correct;
    return {
      isCorrect,
      earnedPoints: isCorrect ? question.points : 0,
    };
  }

  if (question.type === 'MULTI_CHOICE') {
    // Both answers are stored as comma-separated labels, e.g. "A,B,D"
    const correctSet = new Set(
      correct.split(',').map((s) => s.trim()).filter(Boolean)
    );
    const givenSet = new Set(
      given.split(',').map((s) => s.trim()).filter(Boolean)
    );

    const isCorrect =
      correctSet.size === givenSet.size &&
      [...correctSet].every((v) => givenSet.has(v));

    return {
      isCorrect,
      earnedPoints: isCorrect ? question.points : 0,
    };
  }

  return null;
}

// ============================================================
// Full exam result calculation
// ============================================================

/**
 * Calculate the complete exam result from all answers and questions.
 *
 * - Auto-graded answers contribute to `autoScore`.
 * - Manually graded answers (already graded) contribute to `manualScore`.
 * - Ungraded manual questions leave `totalScore` as null (partially graded).
 */
export function calculateExamResult(
  session: SessionForScoring,
  answers: AnswerForGrading[],
  questions: QuestionForGrading[],
  exam: ExamForScoring
): ExamResultData {
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  let autoScore = 0;
  let manualScore = 0;
  let correctCount = 0;
  let hasUngradedManual = false;
  const categoryMap: Record<string, CategoryScore> = {};

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) continue;

    // Initialize category if needed
    if (!categoryMap[question.type]) {
      categoryMap[question.type] = {
        type: question.type,
        earnedPoints: 0,
        maxPoints: 0,
        correctCount: 0,
        totalCount: 0,
      };
    }
    const category = categoryMap[question.type];
    category.maxPoints += question.points;
    category.totalCount += 1;

    if (AUTO_GRADABLE_TYPES.includes(question.type)) {
      // Auto-grade
      const result = autoGradeAnswer(question, answer.answerContent);
      if (result) {
        autoScore += result.earnedPoints;
        category.earnedPoints += result.earnedPoints;
        if (result.isCorrect) {
          correctCount += 1;
          category.correctCount += 1;
        }
      }
    } else {
      // Manual grading
      if (answer.earnedPoints != null) {
        manualScore += answer.earnedPoints;
        category.earnedPoints += answer.earnedPoints;
        if (answer.isCorrect) {
          correctCount += 1;
          category.correctCount += 1;
        }
      } else {
        hasUngradedManual = true;
      }
    }
  }

  const isFullyGraded = !hasUngradedManual;
  const totalScore = isFullyGraded ? autoScore + manualScore : null;
  const maxPossibleScore = exam.totalScore;
  const isPassed =
    totalScore != null ? totalScore >= exam.passScore : null;
  const gradeLabel =
    totalScore != null ? getGradeLabel(totalScore, maxPossibleScore) : null;

  // Calculate time taken
  let timeTakenSeconds = 0;
  if (session.startedAt && session.submittedAt) {
    const start =
      typeof session.startedAt === 'string'
        ? new Date(session.startedAt)
        : session.startedAt;
    const end =
      typeof session.submittedAt === 'string'
        ? new Date(session.submittedAt)
        : session.submittedAt;
    timeTakenSeconds = Math.max(
      0,
      Math.floor((end.getTime() - start.getTime()) / 1000)
    );
  }

  return {
    sessionId: session.id,
    totalScore,
    autoScore,
    manualScore: isFullyGraded ? manualScore : null,
    maxPossibleScore,
    correctCount,
    totalQuestions: answers.length,
    timeTakenSeconds,
    isPassed,
    gradeLabel,
    categoryScores: categoryMap as CategoryScoreMap,
    isFullyGraded,
  };
}

// ============================================================
// Grade label lookup
// ============================================================

/**
 * Map a numeric score to a letter grade (A/B/C/D/F) based on GRADE_THRESHOLDS.
 */
export function getGradeLabel(score: number, maxScore: number): string {
  if (maxScore <= 0) return 'F';
  const percentage = (score / maxScore) * 100;

  for (const threshold of GRADE_THRESHOLDS) {
    if (percentage >= threshold.minPercentage) {
      return threshold.label;
    }
  }

  return 'F';
}
