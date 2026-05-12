import path from 'path';
import PDFDocument from 'pdfkit';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionType } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────

export interface PdfSessionData {
  exam: {
    title: string;
    totalScore: number;
    passScore: number;
  };
  employee: {
    name: string;
    employeeNo: string;
    department: string;
  };
  submittedAt: string | null;
  result: {
    totalScore: number | null;
    correctCount: number;
    totalQuestions: number;
    timeTakenSeconds: number;
    isPassed: boolean | null;
    gradeLabel: string | null;
  } | null;
  questions: PdfQuestionData[];
}

export interface PdfQuestionData {
  questionType: string;
  content: string;
  yourAnswer: string | null;
  correctAnswer: string | null;
  referenceAnswer: string | null;
  earnedPoints: number;
  maxPoints: number;
  isCorrect: boolean | null;
  options?: { label: string; content: string }[];
}

// ─── Font ───────────────────────────────────────────────────

const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Regular.ttf');

// ─── Helpers ────────────────────────────────────────────────

const SECTION_ORDER: QuestionType[] = [
  'TRUE_FALSE', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'FILL_BLANK',
  'SHORT_ANSWER', 'CASE_ANALYSIS', 'PRACTICAL',
];

const SECTION_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const COLOR_GREEN = '#059669';
const COLOR_RED = '#dc2626';
const COLOR_AMBER = '#92400e';
const COLOR_GRAY = '#78716c';
const COLOR_DARK = '#1c1917';
const COLOR_BORDER = '#d6d3d1';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s}秒`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function groupByType(questions: PdfQuestionData[]): Map<string, PdfQuestionData[]> {
  const groups = new Map<string, PdfQuestionData[]>();
  for (const q of questions) {
    const list = groups.get(q.questionType) ?? [];
    list.push(q);
    groups.set(q.questionType, list);
  }
  const sorted = new Map<string, PdfQuestionData[]>();
  for (const type of SECTION_ORDER) {
    if (groups.has(type)) sorted.set(type, groups.get(type)!);
  }
  for (const [type, list] of groups) {
    if (!sorted.has(type)) sorted.set(type, list);
  }
  return sorted;
}

function isTrueAnswer(answer: string): boolean {
  const v = answer.trim().toUpperCase();
  return v === '对' || v === '正确' || v === 'TRUE' || v === '是';
}

// ─── PDF rendering ──────────────────────────────────────────

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
const INDENT = PAGE_MARGIN + 16;
const INDENT_WIDTH = CONTENT_WIDTH - 16;
const STRIP_H = 18;

/** Available vertical space on the current page */
function remainingSpace(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom - doc.y;
}

/** Move to a new page if needed */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (remainingSpace(doc) < needed) doc.addPage();
}

function drawInfoTable(doc: PDFKit.PDFDocument, data: PdfSessionData) {
  const r = data.result;
  const passLabel = r?.isPassed === true ? '合格' : r?.isPassed === false ? '不合格' : '待定';
  const passColor = r?.isPassed === true ? COLOR_GREEN : r?.isPassed === false ? COLOR_RED : COLOR_AMBER;

  const rows = [
    ['姓名', data.employee.name, '工号', data.employee.employeeNo],
    ['部门', data.employee.department, '提交时间', formatDate(data.submittedAt)],
    ['得分', r ? `${r.totalScore ?? '--'} / ${data.exam.totalScore}` : '--', '结果', passLabel],
    ['正确', r ? `${r.correctCount} / ${r.totalQuestions} 题` : '--', '用时', r ? formatDuration(r.timeTakenSeconds) : '--'],
  ];

  const tableX = PAGE_MARGIN;
  const colWidths = [55, CONTENT_WIDTH / 2 - 55, 55, CONTENT_WIDTH / 2 - 55];
  const rowHeight = 22;
  const startY = doc.y;

  for (let i = 0; i < rows.length; i++) {
    const y = startY + i * rowHeight;
    doc.strokeColor(COLOR_BORDER).lineWidth(0.5);
    doc.rect(tableX, y, CONTENT_WIDTH, rowHeight).stroke();
    let x = tableX;
    for (let j = 0; j < 4; j++) {
      const isLabel = j % 2 === 0;
      if (j > 0) doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();
      doc.fontSize(isLabel ? 9 : 10)
        .fillColor(isLabel ? COLOR_GRAY : (i === 2 && j === 3 ? passColor : COLOR_DARK));
      doc.text(rows[i][j], x + 6, y + 5, { width: colWidths[j] - 12, lineBreak: false });
      x += colWidths[j];
    }
  }
  doc.y = startY + rows.length * rowHeight + 16;
}

/** Strip duplicate label prefix from option content */
function cleanOptionContent(label: string, content: string): string {
  const prefixes = [`${label}.`, `${label}、`, `${label}．`, `${label} `];
  for (const prefix of prefixes) {
    if (content.startsWith(prefix)) return content.slice(prefix.length).trim();
  }
  return content;
}

function formatUserAnswer(q: PdfQuestionData): string {
  if (!q.yourAnswer?.trim()) return '未作答';
  if (q.questionType === 'TRUE_FALSE') return isTrueAnswer(q.yourAnswer) ? '正确' : '错误';
  return q.yourAnswer.trim();
}

function formatCorrectAnswer(q: PdfQuestionData): string {
  if (!q.correctAnswer?.trim()) return '--';
  if (q.questionType === 'TRUE_FALSE') return isTrueAnswer(q.correctAnswer) ? '正确' : '错误';
  return q.correctAnswer.trim();
}

/**
 * Draw a colored result strip. CALLER must ensure enough space exists.
 * Returns the y position after the strip.
 */
function drawResultStrip(
  doc: PDFKit.PDFDocument,
  y: number,
  bgColor: string,
  borderColor: string,
  labelColor: string,
  statusText: string,
  scoreText: string,
  userAns: string,
  correctAns: string,
) {
  // Background
  doc.save();
  doc.rect(INDENT, y, INDENT_WIDTH, STRIP_H).fill(bgColor);
  doc.rect(INDENT, y, INDENT_WIDTH, STRIP_H).strokeColor(borderColor).lineWidth(0.5).stroke();
  doc.restore();

  const textY = y + 4;

  // Status label (colored)
  doc.fillColor(labelColor).fontSize(9);
  doc.text(statusText, INDENT + 6, textY, { width: 80, lineBreak: false });

  // Score
  doc.fillColor(COLOR_DARK).fontSize(9);
  doc.text(scoreText, INDENT + 80, textY, { width: 60, lineBreak: false });

  // User answer
  doc.fillColor('#57534e').fontSize(9);
  doc.text(`考生: ${userAns}`, INDENT + 148, textY, { width: 140, lineBreak: false });

  // Correct answer
  doc.fillColor(COLOR_GREEN).fontSize(9);
  doc.text(`答案: ${correctAns}`, INDENT + 300, textY, { width: INDENT_WIDTH - 306, lineBreak: false });

  return y + STRIP_H;
}

function renderQuestion(doc: PDFKit.PDFDocument, q: PdfQuestionData, index: number) {
  const isCorrect = q.isCorrect === true;
  const isWrong = q.isCorrect === false || (q.isCorrect == null && q.earnedPoints === 0);
  const noAnswer = !q.yourAnswer?.trim();
  const type = q.questionType;
  const isLongForm = type === 'SHORT_ANSWER' || type === 'FILL_BLANK' || type === 'CASE_ANALYSIS' || type === 'PRACTICAL';

  // ── Pre-calculate heights ──
  doc.fontSize(10);
  const stemH = doc.heightOfString(`${index}. ${q.content}`, { width: CONTENT_WIDTH });

  let optionsH = 0;
  if ((type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') && q.options && q.options.length > 0) {
    doc.fontSize(9);
    for (const opt of q.options) {
      const c = cleanOptionContent(opt.label, opt.content);
      optionsH += doc.heightOfString(`    ${opt.label}. ${c}`, { width: INDENT_WIDTH });
    }
    optionsH += 4; // moveDown(0.15) approx
  }

  // Minimum needed: stem + options + result strip + spacing
  const minNeeded = stemH + optionsH + STRIP_H + 20;
  ensureSpace(doc, Math.min(minNeeded, 200)); // cap at 200 to avoid skipping pages for huge questions

  // ── Question stem ──
  doc.fontSize(10).fillColor(COLOR_DARK);
  doc.text(`${index}. ${q.content}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.2);

  // ── Options ──
  if ((type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') && q.options && q.options.length > 0) {
    doc.fontSize(9);
    for (const opt of q.options) {
      const cleanContent = cleanOptionContent(opt.label, opt.content);
      doc.fillColor('#44403c');
      doc.text(`    ${opt.label}. ${cleanContent}`, INDENT, doc.y, { width: INDENT_WIDTH });
    }
    doc.moveDown(0.1);
  }

  // ── Result strip — ensure space for it ──
  const stripNeeded = isLongForm ? 60 : STRIP_H + 8;
  ensureSpace(doc, stripNeeded);

  // Colors
  let bgColor: string, borderColor: string, labelColor: string;
  if (isCorrect) {
    bgColor = '#ecfdf5'; borderColor = '#a7f3d0'; labelColor = COLOR_GREEN;
  } else if (isWrong) {
    bgColor = '#fef2f2'; borderColor = '#fecaca'; labelColor = COLOR_RED;
  } else {
    bgColor = '#fffbeb'; borderColor = '#fde68a'; labelColor = COLOR_AMBER;
  }

  const statusText = isCorrect ? '[正确]' : isWrong ? '[错误]' : '[待定]';
  const scoreText = `${q.earnedPoints}/${q.maxPoints}分`;
  const userAns = formatUserAnswer(q);
  const correctAns = formatCorrectAnswer(q);

  if (isLongForm) {
    // ── Long-form: strip + separate answer lines ──
    const afterStrip = drawResultStrip(doc, doc.y, bgColor, borderColor, labelColor, statusText, scoreText, userAns, correctAns);
    doc.y = afterStrip + 3;

    // User answer detail
    if (!noAnswer) {
      doc.fillColor(COLOR_GRAY).fontSize(8);
      doc.text('考生作答:', INDENT, doc.y, { width: INDENT_WIDTH, lineBreak: false });
      doc.fillColor(COLOR_DARK).fontSize(9);
      doc.text(userAns, INDENT + 8, doc.y, { width: INDENT_WIDTH - 8 });
    }

    // Reference answer
    if (q.correctAnswer?.trim()) {
      doc.moveDown(0.1);
      doc.fillColor(COLOR_GRAY).fontSize(8);
      doc.text('参考答案:', INDENT, doc.y, { width: INDENT_WIDTH, lineBreak: false });
      doc.fillColor(COLOR_GREEN).fontSize(9);
      doc.text(correctAns, INDENT + 8, doc.y, { width: INDENT_WIDTH - 8 });
    }
  } else {
    // ── Short-form: single strip ──
    const afterStrip = drawResultStrip(doc, doc.y, bgColor, borderColor, labelColor, statusText, scoreText, userAns, correctAns);
    doc.y = afterStrip;
  }

  // ── Analysis box for wrong answers ──
  if (isWrong && q.referenceAnswer?.trim()) {
    const analysisText = `解析: ${q.referenceAnswer}`;
    doc.fontSize(8);
    const textH = doc.heightOfString(analysisText, { width: INDENT_WIDTH - 16 });
    const boxH = textH + 8;

    ensureSpace(doc, boxH + 4);
    doc.moveDown(0.15);
    const boxY = doc.y;

    // Blue left-border box
    doc.save();
    doc.rect(INDENT, boxY, INDENT_WIDTH, boxH).fill('#f0f9ff');
    doc.rect(INDENT, boxY, 2.5, boxH).fill('#60a5fa');
    doc.restore();

    doc.fillColor('#1e40af').fontSize(8);
    doc.text(analysisText, INDENT + 10, boxY + 4, { width: INDENT_WIDTH - 20 });
    doc.y = boxY + boxH;
  }

  doc.moveDown(0.35);
}

// ─── Main export ────────────────────────────────────────────

export function generateExamResultPdf(data: PdfSessionData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: PAGE_MARGIN, right: PAGE_MARGIN },
      });

      doc.registerFont('NotoSansSC', fontPath);
      doc.font('NotoSansSC');

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const exportTime = formatDate(new Date().toISOString());

      // ── Title ──
      doc.fontSize(16).fillColor(COLOR_DARK).text('考试成绩报告', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor('#57534e').text(data.exam.title, { align: 'center' });
      doc.moveDown(0.6);

      // ── Info table ──
      drawInfoTable(doc, data);

      // ── Questions by type ──
      const groups = groupByType(data.questions);
      let globalIndex = 1;
      let sectionIdx = 0;

      for (const [type, items] of groups) {
        const typeLabel = QUESTION_TYPE_LABELS[type as QuestionType] ?? type;
        const totalPoints = items.reduce((s, q) => s + q.maxPoints, 0);
        const earnedTotal = items.reduce((s, q) => s + q.earnedPoints, 0);
        const sectionNum = SECTION_NUMBERS[sectionIdx] ?? `${sectionIdx + 1}`;

        ensureSpace(doc, 36);

        // Section header
        doc.fontSize(11).fillColor(COLOR_DARK);
        doc.text(`${sectionNum}、${typeLabel}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: false });
        doc.fontSize(9).fillColor(COLOR_GRAY);
        doc.text(`共${items.length}题 / ${totalPoints}分 / 得${earnedTotal}分`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        // Underline
        doc.strokeColor(COLOR_BORDER).lineWidth(0.5);
        doc.moveTo(PAGE_MARGIN, doc.y + 2).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y + 2).stroke();
        doc.y += 6;

        for (const q of items) {
          renderQuestion(doc, q, globalIndex);
          globalIndex++;
        }
        sectionIdx++;
      }

      // ── Footer on last page ──
      const footerY = doc.page.height - 30;
      doc.fontSize(7).fillColor('#a1a1aa');
      doc.text(
        `${data.employee.name} (${data.employee.employeeNo})  |  ${data.exam.title}  |  导出: ${exportTime}`,
        PAGE_MARGIN, footerY,
        { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
