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
  // Content / question text
  '试题描述(文本)': 'content',
  '试题描述文本': 'content',
  '试题描述': 'content',
  '题目内容': 'content',
  '题目': 'content',
  '问题/处置措施': 'content',

  // True/false answer
  '正确(是/否)': 'correctTF',
  '判断': 'correctTF',
  '是答案': 'correctAnswer',

  // Correct answer
  '正确答案': 'correctAnswer',
  '正确答案(字母)': 'correctAnswer',
  '答案': 'correctAnswer',

  // Level / difficulty
  '试题级别': 'level',
  '级别': 'level',
  '等级': 'level',
  '难度级别': 'level',

  // Department / role
  '所属部门': 'department',
  '部门': 'department',
  '人员范围': 'role',
  '岗位': 'role',

  // Options A-E
  'A选项(文本)': 'optionA',
  'A选项': 'optionA',
  '选项A': 'optionA',
  'B选项(文本)': 'optionB',
  'B选项': 'optionB',
  '选项B': 'optionB',
  'C选项(文本)': 'optionC',
  'C选项': 'optionC',
  '选项C': 'optionC',
  'D选项(文本)': 'optionD',
  'D选项': 'optionD',
  '选项D': 'optionD',
  'E选项(文本)': 'optionE',
  'E选项': 'optionE',
  '选项E': 'optionE',

  // Multi-select
  '可多选(是/否)': 'isMultiSelect',
  '可多选': 'isMultiSelect',

  // Reference / rubric
  '参考答案': 'referenceAnswer',
  '参考答案要点': 'referenceAnswer',
  '正确操作要点': 'referenceAnswer',
  '操作要点': 'referenceAnswer',
  '评分标准': 'gradingRubric',

  // Metadata
  '题目属性': 'deptRole', // combined "部门--岗位" format
  '备注': 'note',
  '解析': 'note',
  '分析要点': 'note',
  '题型': '_questionType',
  '技能': 'level',

  // Merged options column (some files combine A-D in one "选项" column)
  '选项': '_mergedOptions',

  // Index columns (ignored during processing)
  '序号': '_index',
  '序號': '_index',
};

function mapColumnName(header: string, customMap?: Record<string, string>): string {
  const raw = header.trim();
  // Normalize full-width brackets to half-width for lookup
  const normalized = raw.replace(/（/g, '(').replace(/）/g, ')');

  // Custom map takes priority (from AI fallback)
  if (customMap) {
    if (customMap[raw]) return customMap[raw];
    if (customMap[normalized]) return customMap[normalized];
  }

  return COLUMN_MAP[normalized] || COLUMN_MAP[raw] || raw;
}

// ============================================================
// Parse Question Bank Excel
// ============================================================

/**
 * Parse a question bank Excel file (Buffer) and return structured rows.
 * Auto-detects question type from sheet names.
 * Supports .xls and .xlsx formats.
 *
 * @param customColumnMap  Optional column mapping override (e.g. from AI fallback).
 *                         Keys = original header, values = internal field name.
 */
export function parseQuestionExcel(
  buffer: Buffer,
  customColumnMap?: Record<string, string>
): QuestionImportRow[] {
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

    let rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });

    // --- First-row-skip heuristic ---
    // Some files have a description / purpose text as the first row instead
    // of real column headers.  Detect this and re-parse with range: 1.
    // Two cases:
    //   (a) A header key itself is very long or starts with "目的" — the first
    //       row was description text that XLSX used as column names.
    //   (b) No 'content' column found and the first data value is long text.
    if (rawRows.length > 1) {
      const firstRowKeys = Object.keys(rawRows[0]);
      const hasLongHeader = firstRowKeys.some(
        (k) => k.length > 50 || k.startsWith('目的')
      );

      let needReparse = hasLongHeader;

      if (!needReparse) {
        const mappedKeys = firstRowKeys.map((k) => mapColumnName(k, customColumnMap));
        const hasContentCol = mappedKeys.includes('content');
        if (!hasContentCol) {
          const firstVal = String(Object.values(rawRows[0])[0] ?? '');
          if (firstVal.length > 30 || firstVal.startsWith('目的')) {
            needReparse = true;
          }
        }
      }

      if (needReparse) {
        rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          range: 1,
        });
      }
    }

    for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
      const raw = rawRows[rowIdx];
      // Map Chinese column headers to internal names
      const row: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        const mapped = mapColumnName(key, customColumnMap);
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

      // --- Merged options parsing ---
      // Some files put all options in a single column like "A.xxx B.xxx C.xxx D.xxx"
      if (
        options.length === 0 &&
        (questionType === 'SINGLE_CHOICE' || questionType === 'MULTI_CHOICE')
      ) {
        const mergedSrc = row._mergedOptions || '';
        // Also scan other unmapped columns for merged pattern
        const candidates = mergedSrc
          ? [mergedSrc]
          : Object.entries(row)
              .filter(([k]) => !['content', 'correctAnswer', 'correctTF', 'level', 'department', 'role', 'deptRole', 'note', '_index', 'isMultiSelect', 'referenceAnswer', 'gradingRubric'].includes(k))
              .map(([, v]) => v);

        for (const val of candidates) {
          if (/[A-E][.、．]\s*.+[B-E][.、．]/.test(val)) {
            const optParts = val.split(/(?=[A-E][.、．])/);
            for (const part of optParts) {
              const m = part.match(/^([A-E])[.、．]\s*(.+)/);
              if (m) {
                options.push({ label: m[1], content: m[2].trim() });
              }
            }
            break;
          }
        }
      }

      // Determine correct answer
      let correctAnswer: string | undefined;
      if (questionType === 'TRUE_FALSE') {
        // 判断题: "正确(是/否)" column -> "是" = "TRUE", "否" = "FALSE"
        const tfValue = row.correctTF || row.correctAnswer || '';
        if (/^(是|对|正确|√|true|TRUE)$/.test(tfValue)) {
          correctAnswer = 'TRUE';
        } else if (/^(否|错|错误|X|×|false|FALSE)$/.test(tfValue)) {
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
        const parts = row.deptRole.split(/--|—/);
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
// Detect sheets with parsing failures (for AI fallback)
// ============================================================

/**
 * Identify sheets that have data but produced zero parsed rows.
 * Returns sheet names that need AI assistance.
 */
export function detectFailedSheets(buffer: Buffer, customColumnMap?: Record<string, string>): string[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parsed = parseQuestionExcel(buffer, customColumnMap);

  const successSheets = new Set(parsed.map((r) => r._sheetName).filter(Boolean));

  const failed: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const detectedType = detectTypeFromSheetName(sheetName);
    if (!detectedType) continue;
    if (successSheets.has(sheetName)) continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (data.length > 1) {
      failed.push(sheetName);
    }
  }

  return failed;
}

// ============================================================
// Extract Headers + Sample Rows (for AI fallback)
// ============================================================

/**
 * Extract the raw column headers and first few sample rows from an Excel file.
 * Used to feed AI-based column identification when rule-based parsing fails.
 *
 * @param sheetNameFilter  Optional — only extract from this sheet.
 */
export function extractHeadersAndSamples(
  buffer: Buffer,
  maxSamples = 3,
  sheetNameFilter?: string
): { headers: string[]; sampleRows: Record<string, string>[] } | null {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const targetSheet = sheetNameFilter || workbook.SheetNames[0];
  if (!targetSheet) return null;

  const sheet = workbook.Sheets[targetSheet];
  if (!sheet) return null;

  let rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  // Handle first-row-skip: if a header is very long or starts with "目的",
  // re-parse with range:1 so the actual headers are picked up.
  if (rawRows.length > 0) {
    const keys = Object.keys(rawRows[0]);
    if (keys.some((k) => k.length > 50 || k.startsWith('目的'))) {
      rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        range: 1,
      });
    }
  }

  if (rawRows.length === 0) return null;

  const headers = Object.keys(rawRows[0]).filter(k => !k.startsWith('__'));
  const sampleRows = rawRows.slice(0, maxSamples).map((row) => {
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!key.startsWith('__')) {
        mapped[key] = String(value ?? '').substring(0, 200);
      }
    }
    return mapped;
  });

  return { headers, sampleRows };
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
  '工號': 'employeeNo',
  '姓名': 'name',
  '名字': 'name',
  '报考工序': 'process',
  '工序': 'process',
  '報考工序': 'process',
  '报考等级': 'level',
  '等级': 'level',
  '级别': 'level',
  '報考等級': 'level',
  '等級': 'level',
  '級別': 'level',
  '身份证后6位': 'verificationCode',
  '身份证後6位': 'verificationCode',
  '验证码': 'verificationCode',
  '驗證碼': 'verificationCode',
  '密码': 'verificationCode',
  '密碼': 'verificationCode',
  '部门': 'department',
  '部門': 'department',
  '所属部门': 'department',
  '所屬部門': 'department',
};

function mapParticipantColumn(key: string, customMap?: Record<string, string>): string {
  const trimmed = key.trim().replace(/（/g, '(').replace(/）/g, ')');
  if (customMap?.[trimmed]) return customMap[trimmed];
  return PARTICIPANT_COLUMN_MAP[trimmed] || trimmed;
}

/**
 * Parse a participant roster Excel file and return structured rows.
 * Required: 姓名, 报考工序, 报考等级
 * Optional: 工号, 部门, 身份证后6位/验证码
 * Supports first-row-skip for title rows.
 */
export function parseParticipantExcel(
  buffer: Buffer,
  customColumnMap?: Record<string, string>
): ParticipantImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results: ParticipantImportRow[] = [];

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return results;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return results;

  let rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  if (rawRows.length === 0) return results;

  // First-row-skip: if headers are long/garbage (title row merged into header),
  // the actual headers are in the first data row. Re-parse with range:1.
  const firstRowKeys = Object.keys(rawRows[0] as Record<string, unknown>);
  const mappedKeys = firstRowKeys.map((k) => mapParticipantColumn(k, customColumnMap));
  const hasNameCol = mappedKeys.includes('name');
  const hasProcessCol = mappedKeys.includes('process');

  if (!hasNameCol || !hasProcessCol) {
    // Check if first data row looks like actual headers
    const hasLongHeader = firstRowKeys.some(
      (k) => k.length > 30 || k.startsWith('__EMPTY')
    );
    if (hasLongHeader) {
      rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        range: 1,
      });
    }
  }

  for (const raw of rawRows) {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const mapped = mapParticipantColumn(key, customColumnMap);
      row[mapped] = String(value ?? '').trim();
    }

    const name = row.name;
    const process = row.process;
    const level = row.level;

    // name, process, level are required; employeeNo and department are optional
    if (!name || !process || !level) continue;

    results.push({
      ...(row.employeeNo ? { employeeNo: row.employeeNo } : {}),
      name,
      department: row.department || undefined,
      process,
      level,
      verificationCode: row.verificationCode || undefined,
    });
  }

  return results;
}

/**
 * Extract headers and sample rows from participant Excel for AI identification.
 */
export function extractParticipantHeadersAndSamples(
  buffer: Buffer,
  sampleCount = 3
): { headers: string[]; sampleRows: Record<string, string>[] } | null {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;

  // Try with range:1 first (skip title row), fallback to range:0
  let rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', range: 1 });
  if (rawRows.length === 0) {
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  }
  if (rawRows.length === 0) return null;

  const headers = Object.keys(rawRows[0] as Record<string, unknown>).filter(
    (k) => !k.startsWith('__')
  );
  const sampleRows = rawRows.slice(0, sampleCount).map((r) => {
    const row: Record<string, string> = {};
    for (const h of headers) {
      row[h] = String((r as Record<string, unknown>)[h] ?? '').substring(0, 100);
    }
    return row;
  });

  return { headers, sampleRows };
}

// ============================================================
// Parse Question Filename
// ============================================================

export interface ParsedQuestionFilename {
  department: string;
  process: string;
  level: string;
}

/**
 * Parse a question bank filename to extract department, process, and level.
 *
 * Supports two formats:
 * 1. Concatenated: "部门名工序级别.xls"
 *    e.g. "工务部SAWⅡ级.xls", "资材部仓管Ⅰ级.xls",
 *         "制程品管部SAW&DB&WB&QCgateⅠ级.xls"
 * 2. Separator:   "部门--工序--级别.xls"  (backward compat)
 *
 * Returns null if the filename cannot be reliably parsed.
 */
export function parseQuestionFilename(filename: string): ParsedQuestionFilename | null {
  // Remove extension and trailing annotations (" -修改", " 的複本" etc.)
  let name = filename
    .replace(/\.(xls|xlsx)$/i, '')
    .replace(/\s+[-—].*$/, '')
    .replace(/\s+的[複复]本.*$/, '')
    .trim();

  // --- Format 1: "--" separator (backward compat) ---
  const sepParts = name.split('--');
  if (sepParts.length >= 3) {
    return {
      department: sepParts[0].trim(),
      process: sepParts[1].trim(),
      level: sepParts[2].trim(),
    };
  }

  // --- Format 2: Concatenated "部门工序级别" ---
  // Step 1: Extract level (Ⅰ级/Ⅱ级/Ⅲ级) from end
  const levelMatch = name.match(/([ⅠⅡⅢ][级級])$/);
  if (!levelMatch) return null;

  const level = levelMatch[1];
  const beforeLevel = name.slice(0, -level.length);
  if (!beforeLevel) return null;

  // Step 2: Split department from process using known suffix markers.
  // Lazy (.+?) finds the FIRST occurrence of a dept suffix, so
  // "制程品管部SAW" → dept="制程品管部", process="SAW".
  // Longer suffixes listed first to avoid partial matches.
  const deptMatch = beforeLevel.match(
    /^(.+?(?:委员会|中心|部|处|室|科|组))(.+)$/
  );
  if (deptMatch && deptMatch[1] && deptMatch[2]) {
    return {
      department: deptMatch[1],
      process: deptMatch[2],
      level,
    };
  }

  // No department marker found — can't reliably split
  return null;
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
