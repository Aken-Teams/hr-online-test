/**
 * AI 評分端點效能實測：延遲、吞吐量、併發表現
 *
 * 用於評估「雲端 DeepSeek vs 地端模型」在實際閱卷場景下的可用性。
 * 以真實簡答題 + 參考答案組出評分請求，量測：
 *   - 單筆延遲（p50 / p95 / 最慢）
 *   - 併發時的總吞吐量（題/分鐘）
 *   - 以實際考生人數推估整場閱卷所需時間
 *
 * 用法（以環境變數切換端點）：
 *   node scripts/bench-ai-latency.js --n 6 --concurrency 4
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'data', '部门专业知识90%');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const BASE_URL = (process.env.AI_GRADING_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_GRADING_MODEL || 'deepseek-chat';
const API_KEY =
  process.env.AI_GRADING_API_KEY || process.env.deepseek_api_key || process.env.DEEPSEEK_API_KEY;
const MAX_TOKENS = Number(process.env.AI_GRADING_MAX_TOKENS || 800);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** 取樣真實簡答題（含參考答案） */
function loadQuestions(limit) {
  const out = [];
  for (const file of fs.readdirSync(BANK_DIR)) {
    if (!/\.xlsx?$/i.test(file)) continue;
    const wb = XLSX.readFile(path.join(BANK_DIR, file));
    for (const name of wb.SheetNames) {
      if (!name.includes('简答')) continue;
      for (const row of XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })) {
        const content = String(row['试题描述(文本)'] || row['试题描述'] || row['题目'] || '').trim();
        const reference = String(
          row['参考答案'] || row['参考答案要点'] || row['正确答案'] || ''
        ).trim();
        if (content && reference) out.push({ content, reference });
        if (out.length >= limit * 3) return out.slice(0, limit);
      }
    }
  }
  return out.slice(0, limit);
}

const SYSTEM = (maxPoints) => `你是半導體封裝廠技能考核的簡答題閱卷老師，依據「參考答案」為考生作答評分。
請把參考答案拆成得分點，逐一判斷考生作答是否命中，依命中比例給分（總分 ${maxPoints} 分，偶數分）。
回傳 JSON：{"score":數字,"keyPoints":[{"point":"...","hit":true}],"reason":"...","confidence":"high"}
只回 JSON。`;

async function gradeOnce(q) {
  const startedAt = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM(10) },
        {
          role: 'user',
          content: `【題目】${q.content}\n【參考答案】${q.reference}\n【考生作答】${q.reference.slice(0, Math.ceil(q.reference.length / 2))}`,
        },
      ],
      temperature: 0,
      max_tokens: MAX_TOKENS,
      stream: false,
    }),
  });
  const ok = res.ok;
  const json = ok ? await res.json() : null;
  if (!ok) await res.text().catch(() => '');
  return {
    ms: Date.now() - startedAt,
    ok,
    completionTokens: json?.usage?.completion_tokens ?? 0,
  };
}

function percentile(list, p) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 API 金鑰');
    process.exit(1);
  }
  const n = Number(arg('n', '6'));
  const concurrency = Number(arg('concurrency', '4'));
  const questions = loadQuestions(n);

  console.log(`端點：${BASE_URL}`);
  console.log(`模型：${MODEL}　max_tokens=${MAX_TOKENS}`);
  console.log(`樣本：${questions.length} 題\n`);

  // 1) 序列：量測單筆延遲
  console.log('── 序列測試（單筆延遲）──');
  const serial = [];
  for (const q of questions) {
    const r = await gradeOnce(q);
    serial.push(r);
    console.log(`  ${r.ok ? '✓' : '✗'} ${(r.ms / 1000).toFixed(1)}s　輸出 ${r.completionTokens} tokens`);
  }
  const okMs = serial.filter((r) => r.ok).map((r) => r.ms);
  const tokens = serial.filter((r) => r.ok).reduce((s, r) => s + r.completionTokens, 0);
  const totalMs = okMs.reduce((s, m) => s + m, 0);

  console.log(`\n  平均 ${(totalMs / okMs.length / 1000).toFixed(1)}s`);
  console.log(`  p50 ${(percentile(okMs, 50) / 1000).toFixed(1)}s　p95 ${(percentile(okMs, 95) / 1000).toFixed(1)}s　最慢 ${(Math.max(...okMs) / 1000).toFixed(1)}s`);
  console.log(`  產出速度 ${(tokens / (totalMs / 1000)).toFixed(1)} tokens/s`);

  // 2) 併發：量測吞吐量
  console.log(`\n── 併發測試（${concurrency} 併發）──`);
  const batchStart = Date.now();
  const results = await Promise.all(
    questions.slice(0, concurrency).map((q) => gradeOnce(q).catch(() => ({ ok: false, ms: 0, completionTokens: 0 })))
  );
  const batchMs = Date.now() - batchStart;
  const okCount = results.filter((r) => r.ok).length;
  console.log(`  ${okCount}/${results.length} 成功，總耗時 ${(batchMs / 1000).toFixed(1)}s`);
  const throughput = (okCount / (batchMs / 1000)) * 60;
  console.log(`  吞吐量約 ${throughput.toFixed(1)} 題/分鐘`);

  // 3) 推估整場閱卷
  for (const people of [120, 300]) {
    const minutes = people / throughput;
    console.log(`  ${people} 人（每人 1 題簡答）預估 ${minutes.toFixed(1)} 分鐘完成 AI 初評`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
