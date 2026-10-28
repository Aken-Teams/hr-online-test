/**
 * 以客戶新題庫回填既有題目的參考答案（PRD F3-1）
 *
 * 只更新 reference_answer 為空的題目，不新增題目、不改動題幹，
 * 因此可安全重跑，也不會造成題庫重複。
 *
 * 比對方式：題型 + 題幹正規化字串（去空白、全半形標點、編號前綴）
 *
 * 用法：
 *   node scripts/sync-reference-answers.js          # 僅預覽
 *   node scripts/sync-reference-answers.js --apply  # 實際寫入
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'data', '部门专业知识90%');
const APPLY = process.argv.includes('--apply');

const SHEET_TYPE = [
  { keyword: '简答', type: 'SHORT_ANSWER' },
  { keyword: '问答', type: 'SHORT_ANSWER' },
  { keyword: '案例', type: 'CASE_ANALYSIS' },
  { keyword: '实操', type: 'PRACTICAL' },
];
const ANSWER_HEADERS = ['参考答案', '参考答案要点', '正确答案', '答案', '正确操作要点', '操作要点'];
const CONTENT_HEADERS = ['试题描述(文本)', '试题描述', '题目'];

/** 正規化題幹：移除編號前綴、空白與全半形標點差異 */
function normalize(text) {
  return String(text ?? '')
    .replace(/^\s*\d+[.、．)）]\s*/, '')
    .replace(/[\s　]/g, '')
    .replace(/[（）]/g, (m) => (m === '（' ? '(' : ')'))
    .replace(/[？?]/g, '?')
    .replace(/[：:]/g, ':')
    .replace(/[，,]/g, ',')
    .replace(/[。.]$/, '')
    .toLowerCase();
}

function pick(row, headers) {
  for (const h of headers) {
    if (row[h] != null && String(row[h]).trim() !== '') return String(row[h]).trim();
  }
  return '';
}

/** 讀取新題庫中所有「題幹 → 參考答案」對應 */
function loadBankAnswers() {
  const map = new Map();
  let rowCount = 0;

  for (const file of fs.readdirSync(BANK_DIR)) {
    if (!/\.xlsx?$/i.test(file)) continue;
    const wb = XLSX.readFile(path.join(BANK_DIR, file));

    for (const sheetName of wb.SheetNames) {
      const match = SHEET_TYPE.find((s) => sheetName.includes(s.keyword));
      if (!match) continue;

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      for (const row of rows) {
        const content = pick(row, CONTENT_HEADERS);
        const answer = pick(row, ANSWER_HEADERS);
        if (!content || !answer) continue;
        rowCount += 1;
        map.set(`${match.type}:${normalize(content)}`, { answer, sourceFile: file });
      }
    }
  }

  return { map, rowCount };
}

const prisma = new PrismaClient();

(async () => {
  const { map, rowCount } = loadBankAnswers();
  console.log(`新題庫可用的「題幹 → 參考答案」：${map.size} 筆（原始列 ${rowCount}）`);

  const missing = await prisma.question.findMany({
    where: {
      type: { in: ['SHORT_ANSWER', 'CASE_ANALYSIS', 'PRACTICAL'] },
      OR: [{ referenceAnswer: null }, { referenceAnswer: '' }],
    },
    select: { id: true, type: true, content: true, process: true, level: true, department: true },
  });
  console.log(`DB 中缺參考答案的題目：${missing.length} 題`);

  const matched = [];
  const unmatched = [];
  for (const q of missing) {
    const hit = map.get(`${q.type}:${normalize(q.content)}`);
    if (hit) matched.push({ ...q, answer: hit.answer, sourceFile: hit.sourceFile });
    else unmatched.push(q);
  }

  console.log(`\n可回填：${matched.length} 題　無對應：${unmatched.length} 題`);
  console.log('\n可回填前 3 筆：');
  for (const m of matched.slice(0, 3)) {
    console.log(`  [${m.type} ${m.process ?? '-'} ${m.level ?? '-'}] ${m.content.slice(0, 36)}`);
    console.log(`     → ${m.answer.slice(0, 60)}`);
  }

  if (unmatched.length) {
    const by = unmatched.reduce((acc, q) => {
      const k = `${q.department ?? '-'} / ${q.process ?? '-'} ${q.level ?? '-'}`;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    console.log('\n無對應（需客戶補齊）分布：');
    Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  }

  if (!APPLY) {
    console.log('\n（預覽模式，未寫入。加上 --apply 實際執行）');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const m of matched) {
    await prisma.question.update({
      where: { id: m.id },
      data: { referenceAnswer: m.answer },
    });
    updated += 1;
    if (updated % 50 === 0) console.log(`  已回填 ${updated}/${matched.length}`);
  }

  const remain = await prisma.question.count({
    where: { type: 'SHORT_ANSWER', OR: [{ referenceAnswer: null }, { referenceAnswer: '' }] },
  });
  console.log(`\n已回填 ${updated} 題`);
  console.log(`簡答題仍無參考答案：${remain} 題`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
