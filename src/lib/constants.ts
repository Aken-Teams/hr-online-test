import type { QuestionType, ExamStatus, SessionStatus } from '@prisma/client';

// ============================================================
// Department list
// ============================================================

export const DEPARTMENTS = [
  '资材部',
  '工务部',
  '生产部',
  '制程品管部',
  '客户质量部',
  '工程研发部',
  '环安部',
  '质量部',
  '全公司',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

// ============================================================
// Question type labels (Chinese)
// ============================================================

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: '单选题',
  MULTI_CHOICE: '多选题',
  TRUE_FALSE: '判断题',
  SHORT_ANSWER: '简答题',
  FILL_BLANK: '填空题',
  CASE_ANALYSIS: '案例分析题',
  PRACTICAL: '实操题',
};

// ============================================================
// Question type color scheme (Tailwind-compatible)
// ============================================================

export const QUESTION_TYPE_COLORS: Record<
  QuestionType,
  { bg: string; text: string; border: string; badge: string }
> = {
  SINGLE_CHOICE: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
  },
  MULTI_CHOICE: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-800',
  },
  TRUE_FALSE: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-800',
  },
  SHORT_ANSWER: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
  },
  FILL_BLANK: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-800',
  },
  CASE_ANALYSIS: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    badge: 'bg-rose-100 text-rose-800',
  },
  PRACTICAL: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-800',
  },
};

// ============================================================
// Session status labels (Chinese)
// ============================================================

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  SUBMITTED: '已提交',
  AUTO_SUBMITTED: '自动提交',
  GRADING: '待阅卷',
  COMPLETED: '已完成',
};

// ============================================================
// Exam status labels (Chinese)
// ============================================================

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: '草稿',
  PUBLISHED: '待开放',
  ACTIVE: '进行中',
  CLOSED: '已关闭',
  ARCHIVED: '已归档',
};

// ============================================================
// Grade thresholds
// ============================================================

export interface GradeThreshold {
  label: string;
  minPercentage: number;
  color: string;
}

/**
 * Grade thresholds ordered from highest to lowest.
 * To determine a grade, iterate and pick the first where score% >= minPercentage.
 */
export const GRADE_THRESHOLDS: GradeThreshold[] = [
  { label: 'A', minPercentage: 90, color: 'text-green-600' },
  { label: 'B', minPercentage: 80, color: 'text-blue-600' },
  { label: 'C', minPercentage: 70, color: 'text-yellow-600' },
  { label: 'D', minPercentage: 60, color: 'text-orange-600' },
  { label: 'F', minPercentage: 0, color: 'text-red-600' },
];

// ============================================================
// Misc constants
// ============================================================

/** Auto-gradable question types (no manual grading required) */
export const AUTO_GRADABLE_TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
];

/**
 * Question types available when creating/editing an exam.
 * Manual-grade types (SHORT_ANSWER, FILL_BLANK, etc.) are hidden from the UI
 * but kept in the codebase in case the client needs them later.
 */
export const EXAM_QUESTION_TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
];

/** Question types that need manual grading */
export const MANUAL_GRADE_TYPES: QuestionType[] = [
  'SHORT_ANSWER',
  'FILL_BLANK',
  'CASE_ANALYSIS',
  'PRACTICAL',
];

// ============================================================
// Question category labels (BASIC / PROFESSIONAL)
// ============================================================

export const QUESTION_CATEGORY_LABELS: Record<string, string> = {
  BASIC: '基本题',
  PROFESSIONAL: '专业题',
};

// ============================================================
// Exam levels (報考等級)
// ============================================================

export const EXAM_LEVELS = ['Ⅰ级', 'Ⅱ级', 'Ⅲ级'] as const;
export type ExamLevel = (typeof EXAM_LEVELS)[number];

/** Default pagination page size */
export const DEFAULT_PAGE_SIZE = 10;

/** Maximum file upload size in bytes (10 MB) */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
