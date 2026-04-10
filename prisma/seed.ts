import { PrismaClient, QuestionType } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Map sheet names to question types
const SHEET_TYPE_MAP: Record<string, QuestionType> = {
  '判断': QuestionType.TRUE_FALSE,
  '判断题': QuestionType.TRUE_FALSE,
  '单选': QuestionType.SINGLE_CHOICE,
  '单选题': QuestionType.SINGLE_CHOICE,
  '多选': QuestionType.MULTI_CHOICE,
  '多选题': QuestionType.MULTI_CHOICE,
  '简答': QuestionType.SHORT_ANSWER,
  '简答题': QuestionType.SHORT_ANSWER,
  '填空': QuestionType.FILL_BLANK,
  '填空题': QuestionType.FILL_BLANK,
  '实操': QuestionType.PRACTICAL,
  '实操题': QuestionType.PRACTICAL,
  '案例分析': QuestionType.CASE_ANALYSIS,
  '案例分析题': QuestionType.CASE_ANALYSIS,
  '选择': QuestionType.SINGLE_CHOICE,
};

// Parse department/sub-department/level from filename
function parseFilename(filename: string): { department: string; subDepartment: string; level: string } {
  const name = filename.replace(/\.(xls|xlsx)$/, '');
  const parts = name.split('--').map(s => s.trim());

  // Map shorthand to full department names
  const deptMap: Record<string, string> = {
    '仓管': '资材部',
    '工务': '工务部',
    '生产': '生产部',
    '制程品管': '制程品管部',
    '客户质量部': '客户质量部',
    '工程研发': '工程研发部',
    '题库': '全公司',
  };

  let department = '全公司';
  let subDepartment = '';
  let level = '';

  if (parts.length >= 2) {
    department = deptMap[parts[0]] || parts[0];
    subDepartment = parts[1];
    // Extract level from sub-department
    if (subDepartment.includes('一级') || subDepartment.includes('1级')) {
      level = '一级题库';
    } else if (subDepartment.includes('二级') || subDepartment.includes('2级')) {
      level = '二级题库';
    }
  }

  // Special cases
  if (filename.includes('环安')) {
    department = '环安部';
    subDepartment = '环安';
  }
  if (filename.includes('质量')) {
    department = '质量部';
    subDepartment = '质量';
  }

  return { department, subDepartment, level };
}

// Get cell value as string
function cellStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

interface ParsedQuestion {
  type: QuestionType;
  content: string;
  level: string;
  department: string;
  subDepartment: string;
  role: string;
  correctAnswer: string;
  isMultiSelect: boolean;
  referenceAnswer: string;
  options: { label: string; content: string }[];
  sourceFile: string;
}

function parseSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileMeta: { department: string; subDepartment: string; level: string },
  sourceFile: string,
): ParsedQuestion[] {
  const type = SHEET_TYPE_MAP[sheetName];
  if (!type) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const questions: ParsedQuestion[] = [];

  for (const row of rows) {
    const content = cellStr(row, '试题描述(文本)', '试题描述', '题目');
    if (!content) continue;

    const level = cellStr(row, '试题级别', '级别') || fileMeta.level || '通用题目';
    const department = cellStr(row, '所属部门') || fileMeta.department;
    const role = cellStr(row, '人员范围', '题目属性') || '所有人适用';
    const subDepartment = fileMeta.subDepartment;

    let correctAnswer = '';
    let isMultiSelect = false;
    let referenceAnswer = '';
    const options: { label: string; content: string }[] = [];

    if (type === QuestionType.TRUE_FALSE) {
      correctAnswer = cellStr(row, '正确(是/否)', '正确', '正确答案');
      // Normalize to 是/否
      if (correctAnswer === '对' || correctAnswer === '√' || correctAnswer === 'Y') correctAnswer = '是';
      if (correctAnswer === '错' || correctAnswer === '×' || correctAnswer === 'N') correctAnswer = '否';
    } else if (type === QuestionType.SINGLE_CHOICE || type === QuestionType.MULTI_CHOICE) {
      const multiStr = cellStr(row, '可多选(是/否)', '可多选');
      isMultiSelect = multiStr === '是' || type === QuestionType.MULTI_CHOICE;
      correctAnswer = cellStr(row, '正确答案', '答案');

      for (const label of ['A', 'B', 'C', 'D', 'E', 'F']) {
        const optContent = cellStr(row, `${label}选项(文本)`, `${label}选项`, label);
        if (optContent) {
          options.push({ label, content: optContent });
        }
      }
    } else {
      // SHORT_ANSWER, FILL_BLANK, CASE_ANALYSIS, PRACTICAL
      referenceAnswer = cellStr(row, '正确答案', '参考答案', '答案', '操作要点', '分析要点');
    }

    questions.push({
      type: isMultiSelect ? QuestionType.MULTI_CHOICE : type,
      content,
      level,
      department,
      subDepartment,
      role,
      correctAnswer,
      isMultiSelect,
      referenceAnswer,
      options,
      sourceFile,
    });
  }

  return questions;
}

async function importExcelFile(filePath: string): Promise<number> {
  const filename = path.basename(filePath);
  const fileMeta = parseFilename(filename);

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    console.warn(`  Skipping ${filename}: cannot read file`);
    return 0;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    console.warn(`  Skipping ${filename}: cannot parse Excel`);
    return 0;
  }

  let totalImported = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const questions = parseSheet(sheet, sheetName, fileMeta, filename);

    for (const q of questions) {
      try {
        await prisma.question.create({
          data: {
            type: q.type,
            content: q.content,
            level: q.level,
            department: q.department,
            subDepartment: q.subDepartment,
            role: q.role,
            correctAnswer: q.correctAnswer || null,
            isMultiSelect: q.isMultiSelect,
            referenceAnswer: q.referenceAnswer || null,
            sourceFile: q.sourceFile,
            points: q.type === QuestionType.SHORT_ANSWER || q.type === QuestionType.CASE_ANALYSIS || q.type === QuestionType.PRACTICAL ? 20 : 2,
            options: {
              create: q.options.map((opt, idx) => ({
                label: opt.label,
                content: opt.content,
                sortOrder: idx,
              })),
            },
          },
        });
        totalImported++;
      } catch (err) {
        console.warn(`  Failed to import question: ${q.content.substring(0, 30)}...`, err);
      }
    }
  }

  return totalImported;
}

async function importExistingJson(): Promise<number> {
  const jsonPath = path.join(process.cwd(), 'questions.json');
  if (!fs.existsSync(jsonPath)) return 0;

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  let count = 0;

  // True/False
  for (const q of data.tf || []) {
    await prisma.question.create({
      data: {
        type: QuestionType.TRUE_FALSE,
        content: q.q,
        level: q.level || '通用题目',
        department: q.dept || '全公司',
        role: q.role || '所有人适用',
        correctAnswer: q.answer || null,
        sourceFile: 'questions.json',
      },
    });
    count++;
  }

  // Multiple Choice
  for (const q of data.mc || []) {
    await prisma.question.create({
      data: {
        type: QuestionType.SINGLE_CHOICE,
        content: q.q,
        level: q.level || '通用题目',
        department: q.dept || '全公司',
        role: q.role || '所有人适用',
        correctAnswer: q.answer || null,
        isMultiSelect: q.multi || false,
        sourceFile: 'questions.json',
        options: {
          create: Object.entries(q.options || {}).map(([label, content], idx) => ({
            label,
            content: String(content),
            sortOrder: idx,
          })),
        },
      },
    });
    count++;
  }

  // Short Answer
  for (const q of data.sa || []) {
    await prisma.question.create({
      data: {
        type: QuestionType.SHORT_ANSWER,
        content: q.q,
        level: q.level || '通用题目',
        department: q.dept || '全公司',
        role: q.role || '所有人适用',
        points: 20,
        sourceFile: 'questions.json',
      },
    });
    count++;
  }

  return count;
}

async function main() {
  console.log('Starting database seed...\n');

  // 1. Create default admin
  const adminExists = await prisma.admin.findUnique({ where: { username: 'admin' } });
  if (!adminExists) {
    await prisma.admin.create({
      data: {
        username: 'admin',
        passwordHash: await bcrypt.hash('admin123', 10),
        displayName: '系统管理员',
        role: 'SUPER_ADMIN',
      },
    });
    console.log('Created admin user: admin / admin123');
  }

  // 2. Import questions from existing questions.json
  const existingCount = await prisma.question.count();
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} questions. Skipping import.\n`);
    return;
  }

  console.log('Importing questions from questions.json...');
  const jsonCount = await importExistingJson();
  console.log(`  Imported ${jsonCount} questions from questions.json\n`);

  // 3. Import from department Excel files
  const deptDir = path.join(process.cwd(), 'data', '部门发--题库');
  if (fs.existsSync(deptDir)) {
    const files = fs.readdirSync(deptDir).filter(f =>
      (f.endsWith('.xls') || f.endsWith('.xlsx')) && !f.startsWith('~$')
    );
    console.log(`Found ${files.length} Excel files in data/部门发--题库/\n`);

    for (const file of files) {
      const filePath = path.join(deptDir, file);
      console.log(`Importing: ${file}`);
      const count = await importExcelFile(filePath);
      console.log(`  -> ${count} questions imported\n`);
    }
  }

  // 4. Import from sample files (if not already imported via json)
  const sampleDir = path.join(process.cwd(), 'data', '试题范例');
  if (fs.existsSync(sampleDir) && jsonCount === 0) {
    const files = fs.readdirSync(sampleDir).filter(f =>
      f.endsWith('.xls') || f.endsWith('.xlsx')
    );
    for (const file of files) {
      const filePath = path.join(sampleDir, file);
      console.log(`Importing sample: ${file}`);
      const count = await importExcelFile(filePath);
      console.log(`  -> ${count} questions imported\n`);
    }
  }

  const totalQuestions = await prisma.question.count();
  const byType = await prisma.question.groupBy({
    by: ['type'],
    _count: true,
  });

  console.log(`\nSeed complete! Total questions: ${totalQuestions}`);
  console.log('By type:');
  for (const t of byType) {
    console.log(`  ${t.type}: ${t._count}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
