import * as XLSX from 'xlsx';
import type { QuestionType } from '@prisma/client';
import type {
  QuestionImportRow,
  ResultExportRow,
  EmployeeImportRow,
  ParticipantImportRow,
} from '@/types/exam';

// ============================================================
// Sheet name -> QuestionType mapping
// ============================================================

const SHEET_TYPE_MAP: Record<string, QuestionType> = {
  '判断题': 'TRUE_FALSE',
  '判断': 'TRUE_FALSE',
  '单选': 'SINGLE_CHOICE',
  '单选题': 'SINGLE_CHOICE',
  '选择': 'SINGLE_CHOICE', // default to single; isMultiSelect checked below
  '选择题': 'SINGLE_CHOICE',
  '多选': 'MULTI_CHOICE',
  '多选题': 'MULTI_CHOICE',
  '简答': 'SHORT_ANSWER',
  '简答题': 'SHORT_ANSWER',
  '问答': 'SHORT_ANSWER',
  '问答题': 'SHORT_ANSWER',
  '填空': 'FILL_BLANK',
  '填空题': 'FILL_BLANK',
  '案例分析': 'CASE_ANALYSIS',
  '案例分析题': 'CASE_ANALYSIS',
  '实操': 'PRACTICAL',
  '实操题': 'PRACTICAL',
};

/**
 * Detect the QuestionType from a sheet name by checking for known keywords.
 */
function detectTypeFromSheetName(sheetName: string): QuestionType | null {
  const trimmed = sheetName.trim();

  // Exact match first
  if (SHEET_TYPE_MAP[trimmed]) {
    return SHEET_TYPE_MAP[trimmed];
  }

  // Partial/keyword match
  for (const [keyword, type] of Object.entries(SHEET_TYPE_MAP)) {
    if (trimmed.includes(keyword)) {
      return type;
    }
  }

  return null;
}

// ============================================================
// Chinese column name mapping
// ============================================================

/** Map Chinese column headers to our internal field names. */
const COLUMN_MAP: Record<string, string> = {
  '试题描述(文本)': 'content',
  '试题描述': 'content',
  '题目内容': 'content',
  '题目': 'content',
  '正确(是/否)': 'correctTF',
  '正确答案': 'correctAnswer',
  '答案': 'correctAnswer',
  '试题级别': 'level',
  '级别': 'level',
  '所属部门': 'department',
  '部门': 'department',
  '人员范围': 'role',
  '岗位': 'role',
  'A选项(文本)': 'optionA',
  'A选项': 'optionA',
  'B选项(文本)': 'optionB',
  'B选项': 'optionB',
  'C选项(文本)': 'optionC',
  'C选项': 'optionC',
  'D选项(文本)': 'optionD',
  'D选项': 'optionD',
  'E选项(文本)': 'optionE',
  'E选项': 'optionE',
  '可多选(是/否)': 'isMultiSelect',
  '可多选': 'isMultiSelect',
  '参考答案': 'referenceAnswer',
  '评分标准': 'gradingRubric',
  '题目属性': 'deptRole', // combined "部门--岗位" format
  '备注': 'note',
};

function mapColumnName(header: string): string {
  const trimmed = header.trim();
  return COLUMN_MAP[trimmed] || trimmed;
}

// ============================================================
// Parse Question Bank Excel
// ============================================================

/**
 * Parse a question bank Excel file (Buffer) and return structured rows.
 * Auto-detects question type from sheet names.
 * Supports .xls and .xlsx formats.
 */
export function parseQuestionExcel(buffer: Buffer): QuestionImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results: QuestionImportRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const detectedType = detectTypeFromSheetName(sheetName);
    if (!detectedType) {
      // Skip sheets we cannot identify
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });

    for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
      const raw = rawRows[rowIdx];
      // Map Chinese column headers to internal names
      const row: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        const mapped = mapColumnName(key);
        row[mapped] = String(value ?? '').trim();
      }

      const content = row.content;
      if (!content) continue; // Skip empty rows

      // Determine the actual type (may override to MULTI_CHOICE)
      let questionType = detectedType;
      const isMulti =
        row.isMultiSelect === '是' ||
        row.isMultiSelect === 'true' ||
        row.isMultiSelect === '1';

      if (isMulti && detectedType === 'SINGLE_CHOICE') {
        questionType = 'MULTI_CHOICE';
      }

      // Build options array for choice questions
      const options: { label: string; content: string }[] = [];
      const optionLabels = ['A', 'B', 'C', 'D', 'E'];
      for (const label of optionLabels) {
        const optContent = row[`option${label}`];
        if (optContent) {
          options.push({ label, content: optContent });
        }
      }

      // Determine correct answer
      let correctAnswer: string | undefined;
      if (questionType === 'TRUE_FALSE') {
        // 判断题: "正确(是/否)" column -> "是" = "TRUE", "否" = "FALSE"
        const tfValue = row.correctTF || row.correctAnswer || '';
        if (tfValue === '是' || tfValue === '对' || tfValue === '√' || tfValue === 'true' || tfValue === 'TRUE') {
          correctAnswer = 'TRUE';
        } else if (tfValue === '否' || tfValue === '错' || tfValue === 'X' || tfValue === '×' || tfValue === 'false' || tfValue === 'FALSE') {
          correctAnswer = 'FALSE';
        } else if (tfValue) {
          correctAnswer = tfValue;
        }
      } else {
        correctAnswer = row.correctAnswer || undefined;
      }

      // Parse combined "部门--岗位" field if individual fields are missing
      let department = row.department || '';
      let role = row.role || '';
      if (!department && !role && row.deptRole) {
        const parts = row.deptRole.split('--');
        department = parts[0]?.trim() || '';
        role = parts[1]?.trim() || department; // fallback to dept if no role
      }

      const importRow: QuestionImportRow = {
        content,
        type: questionType,
        level: row.level || '一级题库',
        department: department || '全公司',
        role: role || '全员',
        correctAnswer,
        isMultiSelect: isMulti,
        referenceAnswer: row.referenceAnswer || undefined,
        sourceFile: undefined, // Set by caller
        _sheetName: sheetName,
        _rowIndex: rowIdx + 1, // +1 because row 0 is header in openpyxl anchor coords
      };

      if (options.length > 0) {
        importRow.options = options;
      }

      results.push(importRow);
    }
  }

  return results;
}

// ============================================================
// Generate Results Excel
// ============================================================

/**
 * Generate an XLSX buffer containing exam results for download/export.
 */
export function generateResultsExcel(results: ResultExportRow[]): Buffer {
  const headers = [
    '工号',
    '姓名',
    '部门',
    '岗位',
    '考试名称',
    '线上得分',
    '满分',
    '简答分',
    '实操分',
    '综合成绩',
    '用时(秒)',
    '提交时间',
  ];

  const rows = results.map((r) => [
    r.employeeNo,
    r.employeeName,
    r.department,
    r.role,
    r.examTitle,
    r.totalScore ?? '',
    r.maxPossibleScore,
    r.essayScore ?? '',
    r.practicalScore ?? '',
    r.combinedScore ?? '',
    r.timeTakenSeconds,
    r.submittedAt ?? '',
  ]);

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns based on header width (simple heuristic)
  ws['!cols'] = headers.map((h) => ({
    wch: Math.max(h.length * 2, 12),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '考试成绩');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

// ============================================================
// Parse Offline Score Excel
// ============================================================

export interface OfflineScoreRow {
  employeeNo: string;
  name: string;
  process?: string;
  essayScore?: number;
  practicalScore?: number;
}

/** Chinese column mapping for offline score import */
const OFFLINE_SCORE_COLUMN_MAP: Record<string, string> = {
  '工号': 'employeeNo',
  '员工编号': 'employeeNo',
  '编号': 'employeeNo',
  '姓名': 'name',
  '名字': 'name',
  '工序': 'process',
  '报考工序': 'process',
  '简答分': 'essayScore',
  '简答题': 'essayScore',
  '简答分数': 'essayScore',
  '简答成绩': 'essayScore',
  '纸质简答': 'essayScore',
  '实操分': 'practicalScore',
  '实操': 'practicalScore',
  '实操分数': 'practicalScore',
  '实操成绩': 'practicalScore',
};

/**
 * Parse an offline score Excel file and return structured rows.
 * Expected columns: 工号, 姓名, 简答分, 实操分
 */
export function parseOfflineScoreExcel(buffer: Buffer): OfflineScoreRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results: OfflineScoreRow[] = [];

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return results;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return results;

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  for (const raw of rawRows) {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const trimmedKey = key.trim();
      const mapped = OFFLINE_SCORE_COLUMN_MAP[trimmedKey] || trimmedKey;
      row[mapped] = String(value ?? '').trim();
    }

    const employeeNo = row.employeeNo;
    const name = row.name;
    if (!employeeNo && !name) continue;

    const essayScore = row.essayScore ? parseFloat(row.essayScore) : undefined;
    const practicalScore = row.practicalScore ? parseFloat(row.practicalScore) : undefined;

    if (essayScore == null && practicalScore == null) continue;

    results.push({
      employeeNo: employeeNo || '',
      name: name || '',
      process: row.process || undefined,
      essayScore: essayScore != null && !isNaN(essayScore) ? essayScore : undefined,
      practicalScore: practicalScore != null && !isNaN(practicalScore) ? practicalScore : undefined,
    });
  }

  return results;
}

// ============================================================
// Parse Employee Excel
// ============================================================

/** Chinese column mapping for employee import */
const EMPLOYEE_COLUMN_MAP: Record<string, string> = {
  '工号': 'employeeNo',
  '员工编号': 'employeeNo',
  '编号': 'employeeNo',
  '姓名': 'name',
  '名字': 'name',
  '身份证后6位': 'idCardLast6',
  '身份证': 'idCardLast6',
  '部门': 'department',
  '所属部门': 'department',
  '子部门': 'subDepartment',
  '岗位': 'role',
  '人员范围': 'role',
  '职位': 'role',
  '入职日期': 'hireDate',
  '入职时间': 'hireDate',
};

/**
 * Parse an employee list Excel file (Buffer) and return structured rows.
 */
export function parseEmployeeExcel(buffer: Buffer): EmployeeImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results: EmployeeImportRow[] = [];

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return results;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return results;

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  for (const raw of rawRows) {
    // Map Chinese columns
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const trimmedKey = key.trim();
      const mapped = EMPLOYEE_COLUMN_MAP[trimmedKey] || trimmedKey;
      row[mapped] = String(value ?? '').trim();
    }

    const employeeNo = row.employeeNo;
    const name = row.name;
    if (!employeeNo || !name) continue; // Skip incomplete rows

    const importRow: EmployeeImportRow = {
      employeeNo,
      name,
      department: row.department || '',
      role: row.role || '',
    };

    if (row.idCardLast6) {
      importRow.idCardLast6 = row.idCardLast6;
    }
    if (row.subDepartment) {
      importRow.subDepartment = row.subDepartment;
    }
    if (row.hireDate) {
      importRow.hireDate = row.hireDate;
    }

    results.push(importRow);
  }

  return results;
}

// ============================================================
// Offline Score Import Template
// ============================================================

interface OfflineScoreTemplateRow {
  employeeNo: string;
  name: string;
  department: string;
  process: string;
  onlineScore: number;
  practicalScore: string;
}

/**
 * Generate an Excel template for offline score import.
 * Pre-fills employee info from existing exam sessions so the admin
 * only needs to fill in the practical scores.
 */
export function generateOfflineScoreTemplate(
  employees: OfflineScoreTemplateRow[]
): Buffer {
  const headers = [
    '工号',
    '姓名',
    '部门',
    '工序',
    '线上理论分',
    '实操分',
  ];

  const rows = employees.map((e) => [
    e.employeeNo,
    e.name,
    e.department,
    e.process,
    e.onlineScore,
    e.practicalScore,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 },  // 工号
    { wch: 10 },  // 姓名
    { wch: 14 },  // 部门
    { wch: 14 },  // 工序
    { wch: 12 },  // 线上理论分
    { wch: 10 },  // 实操分
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '线下成绩');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ============================================================
// Parse Participant Excel (應考名單)
// ============================================================

/** Chinese column mapping for participant import */
const PARTICIPANT_COLUMN_MAP: Record<string, string> = {
  '工号': 'employeeNo',
  '员工编号': 'employeeNo',
  '编号': 'employeeNo',
  '姓名': 'name',
  '名字': 'name',
  '报考工序': 'process',
  '工序': 'process',
  '报考等级': 'level',
  '等级': 'level',
  '级别': 'level',
  '身份证后6位': 'idCardLast6',
  '身份证後6位': 'idCardLast6',
  '部门': 'department',
  '部門': 'department',
};

/**
 * Parse a participant roster Excel file and return structured rows.
 * Expected columns: 工号, 姓名, 报考工序, 报考等级
 */
export function parseParticipantExcel(buffer: Buffer): ParticipantImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results: ParticipantImportRow[] = [];

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return results;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return results;

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  for (const raw of rawRows) {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const trimmedKey = key.trim();
      const mapped = PARTICIPANT_COLUMN_MAP[trimmedKey] || trimmedKey;
      row[mapped] = String(value ?? '').trim();
    }

    const employeeNo = row.employeeNo;
    const name = row.name;
    const process = row.process;
    const level = row.level;

    if (!employeeNo || !name || !process || !level) continue;

    results.push({ employeeNo, name, process, level });
  }

  return results;
}

// ============================================================
// Parse Question Filename
// ============================================================

export interface ParsedQuestionFilename {
  department: string;
  process: string;
  level: string;
  author: string;
}

/**
 * Parse a question bank filename to extract metadata.
 * Expected format: "部門--工序--級別--人名.xls"
 * e.g. "生产部--SAW--Ⅰ级--张三.xls"
 */
export function parseQuestionFilename(filename: string): ParsedQuestionFilename | null {
  // Remove extension
  const name = filename.replace(/\.(xls|xlsx)$/i, '');
  const parts = name.split('--');

  if (parts.length < 4) return null;

  return {
    department: parts[0].trim(),
    process: parts[1].trim(),
    level: parts[2].trim(),
    author: parts[3].trim(),
  };
}

// ============================================================
// Generate Results Excel (updated with process column)
// ============================================================

export function generateResultsExcelV2(results: (ResultExportRow & { process?: string | null })[]): Buffer {
  const headers = [
    '工号',
    '姓名',
    '部门',
    '岗位',
    '工序',
    '考试名称',
    '线上得分',
    '满分',
    '实操分',
    '综合成绩',
    '用时(秒)',
    '提交时间',
  ];

  const rows = results.map((r) => [
    r.employeeNo,
    r.employeeName,
    r.department,
    r.role,
    r.process ?? '',
    r.examTitle,
    r.totalScore ?? '',
    r.maxPossibleScore,
    r.practicalScore ?? '',
    r.combinedScore ?? '',
    r.timeTakenSeconds,
    r.submittedAt ?? '',
  ]);

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = headers.map((h) => ({
    wch: Math.max(h.length * 2, 12),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '考试成绩');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}
