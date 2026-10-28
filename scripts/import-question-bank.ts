/**
 * 匯入客戶題庫資料夾（預設 data/部门专业知识90%）
 *
 * 與後台「題庫管理 → 批次匯入」相同的解析與去重邏輯：
 *   - 以 src/lib/excel.ts 的 parseQuestionExcel 解析各 sheet
 *   - 檔名解析出 部門／工序／級別（例如「工务部WBⅠ级.xlsx」）
 *   - 去重指紋：題型 || 部門 || 級別 || 工序 || 題幹
 *   - 簡答題的「正确答案」欄會寫入參考答案（PRD F3-1）
 *
 * 只新增、不刪除既有題目，可安全重跑。
 *
 * 用法：
 *   npx tsx scripts/import-question-bank.ts                 # 預覽
 *   npx tsx scripts/import-question-bank.ts --apply         # 實際匯入
 *   npx tsx scripts/import-question-bank.ts --dir "data/xxx"
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

const envPath = path.resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const APPLY = process.argv.includes('--apply');
const dirArgIndex = process.argv.indexOf('--dir');
const BANK_DIR = path.resolve(
  __dirname,
  '..',
  dirArgIndex >= 0 && process.argv[dirArgIndex + 1]
    ? process.argv[dirArgIndex + 1]
    : path.join('data', '部门专业知识90%')
);

const prisma = new PrismaClient();

/**
 * 題幹正規化：移除編號前綴、空白與全半形標點差異。
 *
 * 後台內建匯入是比對題幹原文，但同一題在新舊檔案間常只差一個「1. 」前綴或
 * 全形空白，會被誤判為新題（實測某檔 201 題有 200 題被誤判），因此改用正規化比對。
 */
function normalizeContent(text: string) {
  return text
    .replace(/^\s*\d+[.、．)）]\s*/, '')
    .replace(/[\s　]/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[？?]/g, '?')
    .replace(/[：:]/g, ':')
    .replace(/[，,]/g, ',')
    .replace(/[。.]$/, '')
    .toLowerCase();
}

/**
 * 去重指紋刻意不含級別：實測同一題在資料庫與新檔案的級別標示常不一致，
 * 若把級別納入比對會重複匯入同一題。級別落差另行統計回報。
 */
function fingerprint(q: {
  type: string;
  department: string;
  process?: string | null;
  content: string;
}) {
  return `${q.type}||${q.department}||${q.process || ''}||${normalizeContent(q.content)}`;
}

async function main() {
  const { parseQuestionExcel, parseQuestionFilename } = await import('../src/lib/excel');

  const files = readdirSync(BANK_DIR).filter((f) => /\.xlsx?$/i.test(f));
  console.log(`題庫資料夾：${path.relative(path.resolve(__dirname, '..'), BANK_DIR)}`);
  console.log(`檔案數：${files.length}\n`);

  // 既有題庫指紋
  const existing = await prisma.question.findMany({
    select: { id: true, type: true, department: true, level: true, process: true, content: true },
  });
  const seen = new Set(existing.map(fingerprint));
  const existingByFp = new Map(existing.map((q) => [fingerprint(q), q]));
  const levelMismatch: { content: string; dbLevel: string; fileLevel: string; file: string }[] = [];
  console.log(`資料庫既有題目：${existing.length} 題\n`);

  type NewQuestion = {
    id: string;
    type: string;
    content: string;
    level: string;
    department: string;
    role: string;
    correctAnswer: string | null;
    isMultiSelect: boolean;
    referenceAnswer: string | null;
    sourceFile: string;
    process: string | null;
    category: string;
    options: { label: string; content: string; imageUrl: string | null }[];
  };

  const toCreate: NewQuestion[] = [];
  const perFile: { file: string; parsed: number; dup: number; add: number; error?: string }[] = [];
  const typeTally: Record<string, number> = {};

  for (const file of files) {
    const meta = parseQuestionFilename(file);
    let rows;
    try {
      rows = parseQuestionExcel(readFileSync(path.join(BANK_DIR, file)));
    } catch (err) {
      perFile.push({ file, parsed: 0, dup: 0, add: 0, error: (err as Error).message });
      continue;
    }

    if (!meta) {
      perFile.push({ file, parsed: rows.length, dup: 0, add: 0, error: '檔名無法解析部門／工序／級別' });
      continue;
    }

    let dup = 0;
    let add = 0;

    for (const row of rows) {
      const category = row.category || 'PROFESSIONAL';
      const candidate = {
        type: row.type,
        content: row.content,
        level: category === 'BASIC' ? '' : meta.level || row.level || '',
        department: meta.department || row.department,
        process: row.process || meta.process || null,
      };

      const fp = fingerprint(candidate);
      if (seen.has(fp)) {
        dup += 1;
        const dbQ = existingByFp.get(fp);
        if (dbQ && candidate.level && dbQ.level !== candidate.level) {
          levelMismatch.push({
            content: row.content.slice(0, 40),
            dbLevel: dbQ.level || '(空)',
            fileLevel: candidate.level,
            file,
          });
        }
        continue;
      }
      seen.add(fp);
      add += 1;
      typeTally[row.type] = (typeTally[row.type] ?? 0) + 1;

      toCreate.push({
        id: randomUUID(),
        ...candidate,
        role: row.role || meta.process || '全员',
        correctAnswer: row.correctAnswer ?? null,
        isMultiSelect: row.isMultiSelect ?? false,
        referenceAnswer: row.referenceAnswer ?? null,
        sourceFile: file,
        category,
        options: (row.options ?? []).map((o) => ({
          label: o.label,
          content: o.content,
          imageUrl: o.imageUrl ?? null,
        })),
      });
    }

    perFile.push({ file, parsed: rows.length, dup, add });
  }

  // ── 報表 ──
  console.log('各檔案解析結果（解析 / 重複 / 可新增）：');
  for (const r of perFile) {
    const flag = r.error ? `  ⚠ ${r.error}` : '';
    console.log(
      `  ${r.file.padEnd(42)} ${String(r.parsed).padStart(4)} / ${String(r.dup).padStart(4)} / ${String(r.add).padStart(4)}${flag}`
    );
  }

  const totals = perFile.reduce(
    (acc, r) => ({ parsed: acc.parsed + r.parsed, dup: acc.dup + r.dup, add: acc.add + r.add }),
    { parsed: 0, dup: 0, add: 0 }
  );
  console.log(`\n合計：解析 ${totals.parsed} 題　重複略過 ${totals.dup} 題　可新增 ${totals.add} 題`);
  console.log('可新增題型分布：', JSON.stringify(typeTally));

  if (levelMismatch.length > 0) {
    const byFile = levelMismatch.reduce<Record<string, number>>((acc, m) => {
      acc[m.file] = (acc[m.file] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`
⚠ 題幹相同但級別標示不一致：${levelMismatch.length} 題（未重複匯入，僅提列）`);
    Object.entries(byFile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .forEach(([f, n]) => console.log(`    ${f}：${n} 題`));
    console.log(
      `    範例：「${levelMismatch[0].content}」資料庫為 ${levelMismatch[0].dbLevel}，檔案標為 ${levelMismatch[0].fileLevel}`
    );
  }

  const withRef = toCreate.filter((q) => q.referenceAnswer).length;
  const shortAnswers = toCreate.filter((q) => q.type === 'SHORT_ANSWER');
  console.log(
    `其中簡答題 ${shortAnswers.length} 題，具參考答案 ${shortAnswers.filter((q) => q.referenceAnswer).length} 題`
  );
  console.log(`全部可新增題目具參考答案：${withRef} 題`);

  if (!APPLY) {
    console.log('\n（預覽模式，未寫入。加上 --apply 實際匯入）');
    return;
  }

  if (toCreate.length === 0) {
    console.log('\n沒有需要新增的題目。');
    return;
  }

  // ── 寫入（分批，避免單次交易過大）──
  const BATCH = 200;
  let created = 0;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const chunk = toCreate.slice(i, i + BATCH);
    await prisma.$transaction(
      async (tx) => {
        await tx.question.createMany({
          data: chunk.map((q) => ({
            id: q.id,
            type: q.type as never,
            content: q.content,
            level: q.level,
            department: q.department,
            role: q.role,
            correctAnswer: q.correctAnswer,
            isMultiSelect: q.isMultiSelect,
            referenceAnswer: q.referenceAnswer,
            sourceFile: q.sourceFile,
            process: q.process,
            category: q.category,
          })),
        });

        const options = chunk.flatMap((q) =>
          q.options.map((o, idx) => ({
            questionId: q.id,
            label: o.label,
            content: o.content,
            imageUrl: o.imageUrl,
            sortOrder: idx,
          }))
        );
        if (options.length > 0) {
          await tx.questionOption.createMany({ data: options });
        }
      },
      { timeout: 60_000 }
    );
    created += chunk.length;
    console.log(`  已寫入 ${created}/${toCreate.length}`);
  }

  await prisma.auditLog.create({
    data: {
      action: 'QUESTION_IMPORTED',
      details: {
        source: path.basename(BANK_DIR),
        files: files.length,
        parsed: totals.parsed,
        duplicates: totals.dup,
        created,
        byType: typeTally,
        via: 'scripts/import-question-bank.ts',
      },
    },
  });

  const [total, saTotal, saWithRef] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({ where: { type: 'SHORT_ANSWER' } }),
    prisma.question.count({
      where: { type: 'SHORT_ANSWER', NOT: [{ referenceAnswer: null }, { referenceAnswer: '' }] },
    }),
  ]);
  console.log(`\n匯入完成：新增 ${created} 題`);
  console.log(`題庫總題數：${total}`);
  console.log(`簡答題：${saTotal} 題，具參考答案 ${saWithRef} 題（${Math.round((saWithRef / saTotal) * 100)}%）`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
