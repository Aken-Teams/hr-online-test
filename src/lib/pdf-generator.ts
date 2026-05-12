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
  'TRUE_FALSE',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'FILL_BLANK',
  'SHORT_ANSWER',
  'CASE_ANALYSIS',
  'PRACTICAL',
];

const SECTION_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const COLOR_GREEN = '#059669';
const COLOR_RED = '#dc2626';
const COLOR_AMBER = '#92400e';
const COLOR_GRAY = '#78716c';
const COLOR_DARK = '#1c1917';
const COLOR_LIGHT_GREEN_BG = '#ecfdf5';
const COLOR_LIGHT_RED_BG = '#fef2f2';
const COLOR_LIGHT_AMBER_BG = '#fffbeb';
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

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remaining < needed) doc.addPage();
}

function drawInfoTable(doc: PDFKit.PDFDocument, data: PdfSessionData) {
  const r = data.result;
  const passLabel = r?.isPassed === true ? '合格' : r?.isPassed === false ? '不合格' : '待定';
  const passColor = r?.isPassed === true ? COLOR_GREEN : r?.isPassed === false ? COLOR_RED : COLOR_AMBER;

  const rows = [
    ['姓名', data.employee.name, '工号', data.employee.employeeNo],
    ['部门', data.employee.department, '提交时间', formatDate(data.submittedAt)],
    ['得分', r ? `${r.totalScore ?? '--'} / ${data.exam.totalScore}` : '--', '结果', passLabel],
    ['正确', r ? `${r.correctCount} / ${data.questions.length} 题` : '--', '用时', r ? formatDuration(r.timeTakenSeconds) : '--'],
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
      const cellText = rows[i][j];
      if (j > 0) doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();
      doc.fontSize(isLabel ? 9 : 10)
        .fillColor(isLabel ? COLOR_GRAY : (i === 2 && j === 3 ? passColor : COLOR_DARK));
      doc.text(cellText, x + 6, y + 5, { width: colWidths[j] - 12, lineBreak: false });
      x += colWidths[j];
    }
  }
  doc.y = startY + rows.length * rowHeight + 20;
}

/** Strip leading label prefix from option content if duplicated (e.g. content="A.xxx" with label="A") */
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

function renderQuestion(doc: PDFKit.PDFDocument, q: PdfQuestionData, index: number) {
  const isCorrect = q.isCorrect === true;
  const isWrong = q.isCorrect === false || (q.isCorrect == null && q.earnedPoints === 0);
  const noAnswer = !q.yourAnswer?.trim();

  ensureSpace(doc, 50);

  // ── Question stem ──
  doc.fontSize(10).fillColor(COLOR_DARK);
  doc.text(`${index}. ${q.content}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.25);

  const type = q.questionType;

  // ── Options (for choice questions) ──
  if ((type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') && q.options && q.options.length > 0) {
    doc.fontSize(9);
    for (const opt of q.options) {
      const cleanContent = cleanOptionContent(opt.label, opt.content);
      doc.fillColor('#44403c');
      doc.text(`    ${opt.label}. ${cleanContent}`, INDENT, doc.y, { width: INDENT_WIDTH });
    }
    doc.moveDown(0.15);
  }

  // ── Result box — compact colored strip ──
  const resultY = doc.y;
  const userAns = formatUserAnswer(q);
  const correctAns = formatCorrectAnswer(q);

  // Background color based on result
  let bgColor: string;
  let borderColor: string;
  let labelColor: string;
  if (isCorrect) {
    bgColor = COLOR_LIGHT_GREEN_BG;
    borderColor = '#a7f3d0';
    labelColor = COLOR_GREEN;
  } else if (isWrong) {
    bgColor = COLOR_LIGHT_RED_BG;
    borderColor = '#fecaca';
    labelColor = COLOR_RED;
  } else {
    bgColor = COLOR_LIGHT_AMBER_BG;
    borderColor = '#fde68a';
    labelColor = COLOR_AMBER;
  }

  // Build result text parts
  const statusLabel = isCorrect ? '✓ 正确' : isWrong ? '✗ 错误' : '? 待定';
  const scoreText = `${q.earnedPoints}/${q.maxPoints}分`;

  // Determine what to show
  const isLongForm = type === 'SHORT_ANSWER' || type === 'FILL_BLANK' || type === 'CASE_ANALYSIS' || type === 'PRACTICAL';

  if (isLongForm) {
    // Long-form answers: multi-line display
    doc.fontSize(9);

    // Status + score line
    const stripH = 20;
    doc.save();
    doc.rect(INDENT, resultY, INDENT_WIDTH, stripH).fill(bgColor);
    doc.rect(INDENT, resultY, INDENT_WIDTH, stripH).strokeColor(borderColor).lineWidth(0.5).stroke();
    doc.restore();
    doc.fillColor(labelColor).fontSize(9);
    doc.text(`${statusLabel}  ${scoreText}`, INDENT + 8, resultY + 5, { width: INDENT_WIDTH - 16, lineBreak: false });
    doc.y = resultY + stripH + 4;

    // User answer
    doc.fillColor(COLOR_GRAY).fontSize(8);
    doc.text('考生作答:', INDENT, doc.y, { width: INDENT_WIDTH });
    doc.fillColor(noAnswer ? COLOR_GRAY : COLOR_DARK).fontSize(9);
    doc.text(noAnswer ? '（未作答）' : userAns, INDENT + 8, doc.y, { width: INDENT_WIDTH - 8 });

    // Correct/reference answer
    if (q.correctAnswer?.trim()) {
      doc.moveDown(0.15);
      doc.fillColor(COLOR_GRAY).fontSize(8);
      doc.text('参考答案:', INDENT, doc.y, { width: INDENT_WIDTH });
      doc.fillColor(COLOR_GREEN).fontSize(9);
      doc.text(correctAns, INDENT + 8, doc.y, { width: INDENT_WIDTH - 8 });
    }
  } else {
    // Short-form: single colored strip with all info
    // Measure to determine height
    let line1 = `${statusLabel}  ${scoreText}`;
    if (type === 'TRUE_FALSE' || type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') {
      line1 += `    考生答案: ${userAns}    正确答案: ${correctAns}`;
    }

    const stripH = 20;
    doc.save();
    doc.rect(INDENT, resultY, INDENT_WIDTH, stripH).fill(bgColor);
    doc.rect(INDENT, resultY, INDENT_WIDTH, stripH).strokeColor(borderColor).lineWidth(0.5).stroke();
    doc.restore();

    // Status + score
    doc.fillColor(labelColor).fontSize(9);
    doc.text(`${statusLabel}  ${scoreText}`, INDENT + 8, resultY + 5, { width: 120, lineBreak: false });

    // Answers on the same line
    doc.fillColor(COLOR_DARK).fontSize(9);
    doc.text(`考生: ${userAns}`, INDENT + 130, resultY + 5, { width: 100, lineBreak: false });
    doc.fillColor(COLOR_GREEN).fontSize(9);
    doc.text(`正确: ${correctAns}`, INDENT + 250, resultY + 5, { width: INDENT_WIDTH - 258, lineBreak: false });

    doc.y = resultY + stripH;
  }

  // ── Analysis for wrong answers ──
  if (isWrong && q.referenceAnswer?.trim()) {
    doc.moveDown(0.2);
    ensureSpace(doc, 30);

    const boxX = INDENT;
    const boxW = INDENT_WIDTH;
    const textX = boxX + 8;
    const textW = boxW - 16;

    const analysisText = `解析: ${q.referenceAnswer}`;
    doc.fontSize(8);
    const textHeight = doc.heightOfString(analysisText, { width: textW });
    const boxH = textHeight + 10;

    const boxY = doc.y;
    doc.save();
    doc.rect(boxX, boxY, boxW, boxH).fill('#f0f9ff');
    doc.moveTo(boxX, boxY).lineTo(boxX, boxY + boxH).lineWidth(2).strokeColor('#60a5fa').stroke();
    doc.restore();

    doc.fillColor('#1e40af').fontSize(8);
    doc.text(analysisText, textX, boxY + 5, { width: textW });
    doc.y = boxY + boxH;
  }

  doc.moveDown(0.4);
}

// ─── Main export ────────────────────────────────────────────

export function generateExamResultPdf(data: PdfSessionData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: PAGE_MARGIN, right: PAGE_MARGIN },
        // No bufferPages — avoids blank page bugs
      });

      doc.registerFont('NotoSansSC', fontPath);
      doc.font('NotoSansSC');

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let pageNumber = 1;
      const exportTime = formatDate(new Date().toISOString());

      // Render footer on current page
      function renderFooter() {
        const savedY = doc.y;
        const footerY = doc.page.height - 35;
        doc.fontSize(7).fillColor('#a1a1aa');
        doc.text(`${data.exam.title}  |  导出: ${exportTime}  |  第 ${pageNumber} 页`, PAGE_MARGIN, footerY, {
          width: CONTENT_WIDTH,
          align: 'center',
          lineBreak: false,
        });
        doc.y = savedY;
      }

      // Listen for new pages to render footer on previous page and header on new page
      doc.on('pageAdded', () => {
        // Go back to the previous page to add its footer
        // (pdfkit doesn't support going back without bufferPages, so we render footer before addPage)
        pageNumber++;
      });

      // ── Title ──
      doc.fontSize(18).fillColor(COLOR_DARK).text('考试成绩报告', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(12).fillColor('#57534e').text(data.exam.title, { align: 'center' });
      doc.moveDown(0.8);

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

        ensureSpace(doc, 40);

        // Section header with underline
        const sectionY = doc.y;
        doc.fontSize(11).fillColor(COLOR_DARK);
        doc.text(`${sectionNum}、${typeLabel}`, PAGE_MARGIN, sectionY, { width: CONTENT_WIDTH });
        doc.fontSize(9).fillColor(COLOR_GRAY);
        doc.text(`共${items.length}题 / ${totalPoints}分 / 得${earnedTotal}分`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.15);
        // Underline
        doc.strokeColor(COLOR_BORDER).lineWidth(0.5);
        doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).stroke();
        doc.moveDown(0.4);

        for (const q of items) {
          renderQuestion(doc, q, globalIndex);
          globalIndex++;
        }
        sectionIdx++;
      }

      // ── Render footer on every page ──
      // We need bufferPages for footers, but we were avoiding it.
      // Alternative: render footer at the bottom of the last page now.
      renderFooter();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
