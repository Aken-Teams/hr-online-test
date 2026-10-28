/**
 * 驗證 AI 評分的供應商切換機制（PRD F3-6）
 *
 * 三種切換時機：
 *   ① 技術性失敗（錯誤／逾時／回應無法解析）
 *   ② 熔斷：連續失敗達門檻後冷卻期內直接跳過
 *   ③ 品質可疑：得分點為空／拆太細／低信心 → 向雲端取第二意見
 *
 * 用法：npx tsx scripts/verify-ai-routing.ts
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

/** 之前實測會讓 gemma4 把得分點拆成 11 點的題目（品質守門的觸發案例） */
const SUSPICIOUS_CASE = {
  content: '简述电镀作业流程',
  referenceAnswer:
    '上料→除油→水洗→活化→电镀→水洗→中和→水洗→烘干→下料，各站需确认药液浓度、温度与电流密度符合作业标准。',
  studentAnswer: '先上料，然后除油水洗，之后电镀，最后烘干下料。',
  maxPoints: 10,
};

const NORMAL_CASE = {
  content: '键合线材进料检验中，外观检验发现异常的处置流程是什么？',
  referenceAnswer:
    '检验发现异常需立即通报工程师，由工程师做二次确认为异常，并依据《P-QC1301 异常及异常品处理程序》执行。',
  studentAnswer: '看到異常先通知工程師，然後照異常處理程序走。',
  maxPoints: 10,
};

async function main() {
  const ai = await import('../src/lib/ai-grading');

  console.log('供應商鏈：');
  for (const p of ai.getAiProviders()) {
    console.log(`  ${p.name.padEnd(9)} ${p.model.padEnd(18)} ${p.baseUrl}`);
  }
  console.log('');

  const cases = [
    { label: '一般案例', input: NORMAL_CASE },
    { label: '易拆過細案例', input: SUSPICIOUS_CASE },
  ];

  for (const c of cases) {
    const startedAt = Date.now();
    const r = await ai.suggestShortAnswerGrade(c.input);
    const ms = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (!r) {
      console.log(`[${c.label}] null（全部供應商失敗 → 人工評分）耗時 ${ms}s`);
      continue;
    }
    console.log(
      `[${c.label}] ${r.score}/10　得分點 ${r.keyPoints.length} 個　信心 ${r.confidence}　模型 ${r.model}` +
        (r.secondOpinion ? `（已取第二意見，取代 ${r.replacedModel}）` : '') +
        `　耗時 ${ms}s`
    );
  }

  console.log('\n供應商健康狀態：');
  for (const p of ai.getAiProviders()) {
    console.log(
      `  ${p.model.padEnd(18)} ${p.healthy ? '正常' : '熔斷中'}　連續失敗 ${p.consecutiveFailures}` +
        (p.lastError ? `　(${p.lastError})` : '')
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
