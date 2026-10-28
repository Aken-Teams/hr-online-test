/**
 * 以資料庫中的真實題目驗證正式評分模組（src/lib/ai-grading.ts）。
 * 不寫入任何資料，純粹確認 prompt、計分、降級機制在線上環境可正常運作。
 *
 * 用法：npx tsx scripts/verify-ai-grading.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// 載入 .env（tsx 不會自動讀取）
const envPath = path.resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

const prisma = new PrismaClient();

async function main() {
  // 動態載入，確保 .env 已先寫入 process.env
  const { suggestShortAnswerGrade, isAiGradingEnabled } = await import('../src/lib/ai-grading');

  console.log('AI 初評啟用狀態：', isAiGradingEnabled());
  console.log('模型：', process.env.AI_GRADING_MODEL || 'deepseek-chat');

  const questions = await prisma.question.findMany({
    where: {
      type: 'SHORT_ANSWER',
      NOT: [{ referenceAnswer: null }, { referenceAnswer: '' }],
    },
    select: { id: true, content: true, referenceAnswer: true, process: true, level: true },
    take: 3,
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`\n取樣 ${questions.length} 題真實題目進行驗證\n`);

  for (const q of questions) {
    console.log('='.repeat(72));
    console.log(`[${q.process} ${q.level}] ${q.content}`);
    console.log(`參考答案：${(q.referenceAnswer ?? '').slice(0, 80)}`);

    // 三種情境：照抄參考答案（應滿分）／只答一半／空白
    const half = (q.referenceAnswer ?? '').slice(0, Math.ceil((q.referenceAnswer ?? '').length / 2));
    const cases: { label: string; answer: string }[] = [
      { label: '完整作答', answer: q.referenceAnswer ?? '' },
      { label: '只答一半', answer: half },
      { label: '空白', answer: '' },
    ];

    for (const c of cases) {
      const result = await suggestShortAnswerGrade({
        content: q.content,
        referenceAnswer: q.referenceAnswer,
        studentAnswer: c.answer,
        maxPoints: 10,
      });
      if (!result) {
        console.log(`  ${c.label}：無建議（已降級為人工評分）`);
        continue;
      }
      const hits = result.keyPoints.filter((k) => k.hit).length;
      console.log(
        `  ${c.label}：${result.score}/10　命中 ${hits}/${result.keyPoints.length}　信心 ${result.confidence}　${result.reason}`
      );
    }
  }

  // 降級機制：無參考答案時不應呼叫 AI
  console.log('\n' + '='.repeat(72));
  const noRef = await suggestShortAnswerGrade({
    content: '測試題目',
    referenceAnswer: null,
    studentAnswer: '隨便寫',
    maxPoints: 10,
  });
  console.log('無參考答案時回傳：', noRef === null ? 'null（正確降級為人工評分）' : '非 null（異常）');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
