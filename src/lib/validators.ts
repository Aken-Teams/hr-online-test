import { z } from 'zod';

// ============================================================
// Auth schemas
// ============================================================

/** Employee verification (name + password/id-card-last-6) */
export const employeeVerifySchema = z.object({
  name: z
    .string()
    .min(1, '请输入姓名')
    .max(50, '姓名不能超过50个字符'),
  password: z
    .string()
    .min(1, '请输入密码')
    .max(100, '密码不能超过100个字符'),
});

export type EmployeeVerifyInput = z.infer<typeof employeeVerifySchema>;

/** Admin login */
export const adminLoginSchema = z.object({
  username: z
    .string()
    .min(1, '请输入用户名')
    .max(50, '用户名不能超过50个字符'),
  password: z
    .string()
    .min(1, '请输入密码')
    .max(100, '密码不能超过100个字符'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// ============================================================
// Answer schemas
// ============================================================

/** Save a single answer during an exam */
export const answerSaveSchema = z.object({
  sessionId: z.string().min(1, 'sessionId 不能为空'),
  questionId: z.string().min(1, 'questionId 不能为空'),
  answerContent: z.string().nullable(),
});

export type AnswerSaveInput = z.infer<typeof answerSaveSchema>;

// ============================================================
// Exam creation schemas
// ============================================================

const questionTypeEnum = z.enum([
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'FILL_BLANK',
  'CASE_ANALYSIS',
  'PRACTICAL',
]);

/** A single rule describing how many questions of a given type to pull */
const questionRuleSchema = z.object({
  questionType: questionTypeEnum,
  count: z.number().int().min(1, '题目数量至少为1'),
  pointsPerQuestion: z.number().int().min(1, '每题分值至少为1'),
  department: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  commonRatio: z
    .number()
    .min(0, '公共题比例不能小于0')
    .max(1, '公共题比例不能大于1')
    .default(0),
});

/** Full exam creation/update payload */
export const examCreateSchema = z.object({
  title: z
    .string()
    .min(1, '请输入考试标题')
    .max(200, '标题不能超过200个字符'),
  description: z.string().max(2000, '描述不能超过2000个字符').nullable().optional(),
  timeLimitMinutes: z
    .number()
    .int()
    .min(1, '考试时间至少1分钟')
    .max(480, '考试时间不能超过8小时'),
  passScore: z.number().int().min(0, '及格分数不能为负数'),
  totalScore: z.number().int().min(1, '总分至少为1'),
  isPracticeMode: z.boolean().default(false),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  maxAttempts: z.number().int().min(1, '最少允许1次作答').default(1),
  showResultImmediately: z.boolean().default(true),
  showCorrectAnswers: z.boolean().default(true),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  resultQueryOpenAt: z.string().datetime().nullable().optional(),
  resultQueryCloseAt: z.string().datetime().nullable().optional(),
  tabSwitchLimit: z.number().int().min(0).default(3),
  enableFaceAuth: z.boolean().default(false),
  questionRules: z
    .array(questionRuleSchema)
    .min(1, '至少需要一条出题规则'),
});

export type ExamCreateInput = z.infer<typeof examCreateSchema>;

// ============================================================
// Question creation schemas
// ============================================================

const questionOptionSchema = z.object({
  label: z.string().min(1, '选项标签不能为空'),
  content: z.string().min(1, '选项内容不能为空'),
  imageUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export const questionCreateSchema = z.object({
  type: questionTypeEnum,
  content: z
    .string()
    .min(1, '题目内容不能为空')
    .max(5000, '题目内容不能超过5000个字符'),
  level: z.string().min(1, '请选择题目级别'),
  department: z.string().min(1, '请选择所属部门'),
  subDepartment: z.string().nullable().optional(),
  role: z.string().min(1, '请选择人员范围'),
  points: z.number().int().min(1, '分值至少为1').default(2),
  difficulty: z.number().int().min(1).max(5).default(1),
  correctAnswer: z.string().nullable().optional(),
  isMultiSelect: z.boolean().default(false),
  referenceAnswer: z.string().nullable().optional(),
  gradingRubric: z.string().nullable().optional(),
  options: z.array(questionOptionSchema).optional(),
  tags: z.array(z.string()).optional(),
});

export type QuestionCreateInput = z.infer<typeof questionCreateSchema>;

// ============================================================
// Employee import schema
// ============================================================

export const employeeImportSchema = z.object({
  employeeNo: z
    .string()
    .min(1, '工号不能为空')
    .max(50, '工号不能超过50个字符'),
  name: z
    .string()
    .min(1, '姓名不能为空')
    .max(50, '姓名不能超过50个字符'),
  idCardLast6: z
    .string()
    .length(6, '身份证后6位必须为6位')
    .optional(),
  department: z.string().min(1, '部门不能为空'),
  subDepartment: z.string().optional(),
  role: z.string().min(1, '岗位不能为空'),
  hireDate: z.string().optional(),
});

export type EmployeeImportInput = z.infer<typeof employeeImportSchema>;

/** Validate an array of employee rows */
export const employeeImportBatchSchema = z.array(employeeImportSchema);

// ============================================================
// Grading schema
// ============================================================

export const gradingSchema = z.object({
  answerId: z.string().min(1, 'answerId 不能为空'),
  earnedPoints: z.number().int().min(0, '得分不能为负数'),
  comment: z.string().max(2000, '评语不能超过2000个字符').optional(),
});

export type GradingInput = z.infer<typeof gradingSchema>;

/** Batch grading: grade multiple answers at once */
export const batchGradingSchema = z.object({
  grades: z.array(gradingSchema).min(1, '至少提交一条评分'),
});

export type BatchGradingInput = z.infer<typeof batchGradingSchema>;
