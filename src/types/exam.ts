import type {
  QuestionType,
  ExamStatus,
  SessionStatus,
  AdminRole,
  AuditAction,
} from '@prisma/client';

// Re-export Prisma enums for convenience
export type { QuestionType, ExamStatus, SessionStatus, AdminRole, AuditAction };

// ============================================================
// Question-related types
// ============================================================

export interface QuestionOptionData {
  id?: string;
  label: string;
  content: string;
  imageUrl?: string | null;
  sortOrder: number;
}

export interface QuestionData {
  id: string;
  type: QuestionType;
  content: string;
  level: string;
  department: string;
  subDepartment?: string | null;
  role: string;
  points: number;
  difficulty: number;
  correctAnswer?: string | null;
  isMultiSelect: boolean;
  referenceAnswer?: string | null;
  gradingRubric?: string | null;
  sourceFile?: string | null;
  isActive: boolean;
  options: QuestionOptionData[];
  tags?: string[];
}

/** Minimal question data sent to the exam-taker (no correct answers) */
export interface ExamQuestionView {
  id: string;
  type: QuestionType;
  content: string;
  points: number;
  isMultiSelect: boolean;
  options: Pick<QuestionOptionData, 'label' | 'content' | 'imageUrl'>[];
  sortOrder: number;
}

// ============================================================
// Exam-related types
// ============================================================

export interface QuestionRuleData {
  id?: string;
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  department?: string | null;
  level?: string | null;
  commonRatio: number;
}

export interface ExamData {
  id: string;
  title: string;
  description?: string | null;
  timeLimitMinutes: number;
  passScore: number;
  totalScore: number;
  isPracticeMode: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  maxAttempts: number;
  showResultImmediately: boolean;
  showCorrectAnswers: boolean;
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
  resultQueryOpenAt?: Date | string | null;
  resultQueryCloseAt?: Date | string | null;
  tabSwitchLimit: number;
  enableFaceAuth: boolean;
  status: ExamStatus;
  questionRules: QuestionRuleData[];
  /** Whether the employee can still start/resume this exam */
  canStart?: boolean;
  /** How many attempts the employee has already made */
  attemptCount?: number;
  /** Active in-progress session if one exists (for auto-resume) */
  existingSession?: { id: string; startedAt: string; attemptNumber: number } | null;
}

export interface ExamListItem {
  id: string;
  title: string;
  description?: string | null;
  timeLimitMinutes: number;
  passScore: number;
  totalScore: number;
  status: ExamStatus;
  displayStatus?: string;
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
  questionCount: number;
  sessionCount: number;
}

// ============================================================
// Session / Exam-Taking types
// ============================================================

export interface ExamSessionData {
  id: string;
  examId: string;
  userId: string;
  status: SessionStatus;
  attemptNumber: number;
  startedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  lastActiveAt?: Date | string | null;
  tabSwitchCount: number;
  isAutoSubmitted: boolean;
  autoSubmitReason?: string | null;
  questionOrder?: string[] | null;
}

export interface AnswerData {
  id: string;
  sessionId: string;
  questionId: string;
  answerContent?: string | null;
  isFlagged: boolean;
  answeredAt?: Date | string | null;
  isCorrect?: boolean | null;
  earnedPoints?: number | null;
  gradedBy?: string | null;
  gradedAt?: Date | string | null;
  graderComment?: string | null;
}

export interface AnswerSavePayload {
  sessionId: string;
  questionId: string;
  answerContent: string | null;
}

// ============================================================
// Result / Grading types
// ============================================================

export interface ExamResultData {
  id?: string;
  sessionId: string;
  totalScore?: number | null;
  autoScore: number;
  manualScore?: number | null;
  maxPossibleScore: number;
  correctCount: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  isPassed?: boolean | null;
  gradeLabel?: string | null;
  categoryScores?: CategoryScoreMap | null;
  isFullyGraded: boolean;
  // Offline scores (imported by admin)
  essayScore?: number | null;
  practicalScore?: number | null;
  combinedScore?: number | null;
}

export interface CategoryScore {
  type: QuestionType;
  earnedPoints: number;
  maxPoints: number;
  correctCount: number;
  totalCount: number;
}

export type CategoryScoreMap = Record<string, CategoryScore>;

export interface GradeInfo {
  label: string;
  score: number;
  maxScore: number;
  percentage: number;
  isPassed: boolean;
}

export interface GradingPayload {
  answerId: string;
  earnedPoints: number;
  comment?: string;
}

// ============================================================
// User / Employee types
// ============================================================

export interface EmployeeData {
  id?: string;
  employeeNo: string;
  name: string;
  idCardLast6?: string | null;
  department: string;
  subDepartment?: string | null;
  role: string;
  photoUrl?: string | null;
  hasFaceDescriptor?: boolean;
  hireDate?: Date | string | null;
  isActive: boolean;
}

export interface EmployeeImportRow {
  employeeNo: string;
  name: string;
  idCardLast6?: string;
  department: string;
  subDepartment?: string;
  role: string;
  hireDate?: string;
}

// ============================================================
// Admin types
// ============================================================

export interface AdminData {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
}

// ============================================================
// Excel import/export types
// ============================================================

export interface QuestionImportRow {
  content: string;
  type: QuestionType;
  level: string;
  department: string;
  role: string;
  correctAnswer?: string;
  isMultiSelect?: boolean;
  referenceAnswer?: string;
  options?: { label: string; content: string; imageUrl?: string }[];
  sourceFile?: string;
  /** Internal: sheet name for image matching */
  _sheetName?: string;
  /** Internal: 0-based row index in sheet for image matching */
  _rowIndex?: number;
}

export interface ResultExportRow {
  employeeNo: string;
  employeeName: string;
  department: string;
  role: string;
  examTitle: string;
  totalScore: number | null;
  maxPossibleScore: number;
  isPassed: boolean | null;
  gradeLabel: string | null;
  timeTakenSeconds: number;
  submittedAt: string | null;
  essayScore?: number | null;
  practicalScore?: number | null;
  combinedScore?: number | null;
}

// ============================================================
// API response wrappers
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================
// Dashboard / Statistics types
// ============================================================

export interface DashboardStats {
  totalExams: number;
  activeExams: number;
  totalQuestions: number;
  totalEmployees: number;
  pendingGrading: number;
  recentSessions: number;
}

export interface ExamStatistics {
  examId: string;
  examTitle: string;
  totalParticipants: number;
  completedCount: number;
  averageScore: number;
  passRate: number;
  highestScore: number;
  lowestScore: number;
  averageTimeTaken: number;
  scoreDistribution: { range: string; count: number }[];
}
