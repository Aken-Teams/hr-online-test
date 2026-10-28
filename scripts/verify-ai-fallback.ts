/**
 * 驗證「地端優先、雲端備援」的供應商切換（PRD F3-6）
 * 用法：npx tsx scripts/verify-ai-fallback.ts
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const ai = await import('../src/lib/ai-grading');
  console.log('供應商鏈：');
  for (const p of ai.getAiProviders()) {
    console.log(`  ${p.name.padEnd(9)} ${p.model.padEnd(18)} ${p.baseUrl}`);
  }
  console.log(`併發數：${ai.AI_GRADING_CONCURRENCY}\n`);

  const input = {
    content: '键合线材进料检验中，外观检验发现异常的处置流程是什么？',
    referenceAnswer:
      '检验发现异常需立即通报工程师，由工程师做二次确认为异常，并依据《P-QC1301 异常及异常品处理程序》执行。',
    studentAnswer: '看到異常先通知工程師，然後照異常處理程序走。',
    maxPoints: 10,
  };

  const startedAt = Date.now();
  const result = await ai.suggestShortAnswerGrade(input);
  const ms = Date.now() - startedAt;

  if (!result) {
    console.log(`結果：null（所有供應商皆失敗 → 降級人工評分）耗時 ${(ms / 1000).toFixed(1)}s`);
    return;
  }
  console.log(`實際採用模型：${result.model}`);
  console.log(`分數 ${result.score}/10　信心 ${result.confidence}　耗時 ${(ms / 1000).toFixed(1)}s`);
  console.log(`得分點：${result.keyPoints.map((k) => (k.hit ? '✓' : '✗') + k.point).join(' | ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
