/**
 * 修正簡答題參考答案欄位（PRD F3-1）
 *
 * 舊版匯入把簡答題的「正确答案」欄寫進 questions.correct_answer，
 * 但閱卷畫面與 AI 初評讀的是 reference_answer，導致看不到參考答案。
 * 本腳本將人工評分題型中「有 correctAnswer、無 referenceAnswer」者搬移過去。
 *
 * 用法：
 *   node scripts/fix-short-answer-reference.js          # 僅預覽
 *   node scripts/fix-short-answer-reference.js --apply  # 實際寫入
 */

const { PrismaClient } = require('@prisma/client');

const MANUAL_TYPES = ['SHORT_ANSWER', 'FILL_BLANK', 'CASE_ANALYSIS', 'PRACTICAL'];
const APPLY = process.argv.includes('--apply');

const prisma = new PrismaClient();

(async () => {
  const targets = await prisma.question.findMany({
    where: {
      type: { in: MANUAL_TYPES },
      correctAnswer: { not: null },
      OR: [{ referenceAnswer: null }, { referenceAnswer: '' }],
    },
    select: { id: true, type: true, process: true, level: true, content: true, correctAnswer: true },
  });

  const byType = targets.reduce((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`待修正題目：${targets.length} 題`);
  console.log('  依題型：', JSON.stringify(byType));
  console.log('\n前 3 筆預覽：');
  for (const q of targets.slice(0, 3)) {
    console.log(`  [${q.type} ${q.process ?? '-'} ${q.level ?? '-'}] ${q.content.slice(0, 40)}`);
    console.log(`     → 參考答案：${(q.correctAnswer ?? '').slice(0, 60)}`);
  }

  if (!APPLY) {
    console.log('\n（預覽模式，未寫入。加上 --apply 實際執行）');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const q of targets) {
    await prisma.question.update({
      where: { id: q.id },
      data: { referenceAnswer: q.correctAnswer },
    });
    updated += 1;
    if (updated % 100 === 0) console.log(`  已處理 ${updated}/${targets.length}`);
  }

  const remaining = await prisma.question.count({
    where: {
      type: 'SHORT_ANSWER',
      OR: [{ referenceAnswer: null }, { referenceAnswer: '' }],
    },
  });

  console.log(`\n已更新 ${updated} 題`);
  console.log(`簡答題仍無參考答案：${remaining} 題（需客戶補齊）`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
