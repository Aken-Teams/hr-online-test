/**
 * AI 簡答題評分能力驗證（spike）
 *
 * 目的：在正式開發 PRD F3 之前，先用 DeepSeek 實測簡答題判分能力，
 *       作為「是否採用 AI 建議分數 / 是否改用地端模型」的決策依據。
 *
 * 流程：
 *   1. 從客戶題庫（data/部门专业知识90%）讀取含參考答案的簡答題
 *   2. 請 DeepSeek 針對每題生成 4 種不同品質的「考生答案」
 *      （full=完全正確 / partial=部分正確 / wrong=概念錯誤 / blank=極短無效）
 *   3. 再以獨立的評分 prompt 請 DeepSeek 判分（0~10，依得分點給分）
 *   4. 與預期分數區間比對，輸出一致率、平均絕對誤差與逐題明細
 *
 * 用法：
 *   node scripts/ai-grading-spike.js            # 預設 6 題
 *   node scripts/ai-grading-spike.js --n 10     # 指定題數
 *   node scripts/ai-grading-spike.js --out report.json
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'data', '部门专业知识90%');
const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';
const CONCURRENCY = 4;
const MAX_POINTS = 10;

/** 各品質等級的預期分數區間（用來計算一致率） */
const EXPECTED_BAND = {
  full: [8, 10],
  partial: [3, 7],
  wrong: [0, 2],
  blank: [0, 1],
};

const LEVEL_LABEL = {
  full: '完全正確',
  partial: '部分正確',
  wrong: '概念錯誤',
  blank: '極短無效',
};

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();
const API_KEY = process.env.deepseek_api_key || process.env.DEEPSEEK_API_KEY;

// ---------------------------------------------------------------------------
// 題庫讀取
// ---------------------------------------------------------------------------

const ANSWER_HEADERS = ['正确答案', '参考答案', '参考答案要点', '答案'];
const CONTENT_HEADERS = ['试题描述(文本)', '试题描述', '题目'];

/** 從檔名解析 部門 / 工序 / 級別，例如「工务部WBⅠ级.xlsx」 */
function parseFileName(file) {
  const base = path.basename(file).replace(/\.(xlsx?|XLSX?)$/, '');
  const m = base.match(/^(.*?部)(.*?)(Ⅰ级|Ⅱ级|Ⅲ级)$/);
  if (!m) return { department: base, process: '', level: '' };
  return { department: m[1], process: m[2], level: m[3] };
}

function pick(row, headers) {
  for (const h of headers) {
    if (row[h] != null && String(row[h]).trim() !== '') return String(row[h]).trim();
  }
  return '';
}

/** 讀取所有簡答題（含參考答案） */
function loadShortAnswerQuestions() {
  const out = [];
  for (const file of fs.readdirSync(BANK_DIR)) {
    if (!/\.xlsx?$/i.test(file)) continue;
    const full = path.join(BANK_DIR, file);
    const meta = parseFileName(file);
    const wb = XLSX.readFile(full);
    for (const sheetName of wb.SheetNames) {
      if (!sheetName.includes('简答')) continue;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      for (const row of rows) {
        const content = pick(row, CONTENT_HEADERS);
        const reference = pick(row, ANSWER_HEADERS);
        if (!content || !reference) continue;
        out.push({ ...meta, sourceFile: file, content, reference });
      }
    }
  }
  return out;
}

/** 平均取樣，盡量涵蓋不同部門／工序 */
function sample(list, n) {
  const byProcess = new Map();
  for (const q of list) {
    const key = `${q.department}/${q.process}`;
    if (!byProcess.has(key)) byProcess.set(key, []);
    byProcess.get(key).push(q);
  }
  const keys = [...byProcess.keys()];
  const picked = [];
  let i = 0;
  while (picked.length < n && keys.length > 0) {
    const key = keys[i % keys.length];
    const bucket = byProcess.get(key);
    if (bucket && bucket.length) {
      picked.push(bucket.splice(Math.floor(bucket.length / 2), 1)[0]);
    }
    i += 1;
    if (i > n * keys.length) break;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// DeepSeek
// ---------------------------------------------------------------------------

async function callDeepSeek(messages, { temperature = 0.2, maxTokens = 900 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`DeepSeek ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    const json = await res.json();
    return {
      content: json.choices?.[0]?.message?.content ?? '',
      usage: json.usage ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`回應非 JSON：${text.slice(0, 200)}`);
  return JSON.parse(m[0]);
}

async function withRetry(fn, label, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`  ! ${label} 第 ${i} 次失敗：${err.message.slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const ANSWER_GEN_SYSTEM = `你是半導體封裝廠的資深產線員工，正在參加技能考核的簡答題。
請依指示，針對同一題目寫出四種不同作答品質的答案，模擬真實考生的口吻（可以有錯字、口語、不完整的句子）。

回傳 JSON：
{
  "full": "完全正確：涵蓋參考答案全部要點，但必須換句話說，不可逐字照抄",
  "partial": "部分正確：只答到大約一半的要點，其餘遺漏",
  "wrong": "概念錯誤：看似相關但實際答錯，或答非所問",
  "blank": "極短無效：一兩個字、敷衍作答或寫不知道"
}
只回 JSON，不要其他文字。`;

const GRADING_SYSTEM = `你是半導體封裝廠技能考核的簡答題閱卷老師，依據「參考答案」為考生作答評分。

評分規則：
1. 先把參考答案拆成數個「得分點」（通常 2~5 個）。
2. 逐一判斷考生作答是否命中各得分點；意思正確即可命中，不要求用字相同。
3. 總分 {MAX_POINTS} 分，依命中比例給分，只給偶數分（0、2、4、6、8、10）。
4. 空白、與題目無關、或明顯胡謅者給 0 分。
5. 僅憑參考答案判斷，不要自行補充廠內未提及的知識。
6. confidence 表示你對此分數的把握：high / medium / low。作答模糊、參考答案過於簡略、或需要現場知識才能判斷時給 low。

回傳 JSON：
{
  "score": 0到{MAX_POINTS}的偶數,
  "keyPoints": [{"point": "得分點描述", "hit": true/false}],
  "reason": "一句話說明評分依據（繁體中文，40字內）",
  "confidence": "high|medium|low"
}
只回 JSON，不要其他文字。`;

function buildGradingMessages(question, studentAnswer) {
  return [
    { role: 'system', content: GRADING_SYSTEM.replace(/\{MAX_POINTS\}/g, String(MAX_POINTS)) },
    {
      role: 'user',
      content: [
        `【題目】${question.content}`,
        `【參考答案】${question.reference}`,
        `【考生作答】${studentAnswer || '（空白）'}`,
      ].join('\n'),
    },
  ];
}

// ---------------------------------------------------------------------------
// 併發控制
// ---------------------------------------------------------------------------

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  if (!API_KEY) {
    console.error('找不到 deepseek_api_key，請確認 .env 設定。');
    process.exit(1);
  }

  const n = Number(arg('n', '6'));
  const outFile = arg('out', path.join(ROOT, 'scripts', 'ai-grading-spike-report.json'));

  console.log('讀取題庫…');
  const all = loadShortAnswerQuestions();
  console.log(`  含參考答案之簡答題：${all.length} 題`);

  const questions = sample(all, n);
  console.log(`  本次抽樣：${questions.length} 題\n`);

  const usage = { prompt: 0, completion: 0 };
  const addUsage = (u) => {
    if (!u) return;
    usage.prompt += u.prompt_tokens ?? 0;
    usage.completion += u.completion_tokens ?? 0;
  };

  // 1) 生成模擬考生作答
  console.log('步驟 1／2：生成模擬考生作答…');
  const withAnswers = await mapLimit(questions, CONCURRENCY, async (q, i) => {
    const res = await withRetry(
      () =>
        callDeepSeek([
          { role: 'system', content: ANSWER_GEN_SYSTEM },
          { role: 'user', content: `【題目】${q.content}\n【參考答案】${q.reference}` },
        ], { temperature: 0.8 }),
      `生成作答 #${i + 1}`
    );
    addUsage(res.usage);
    const gen = parseJson(res.content);
    console.log(`  ✓ [${i + 1}/${questions.length}] ${q.process} ${q.level} — ${q.content.slice(0, 28)}…`);
    return { ...q, generated: gen };
  });

  // 2) 逐一評分
  console.log('\n步驟 2／2：AI 評分…');
  const tasks = [];
  withAnswers.forEach((q, qi) => {
    for (const level of Object.keys(EXPECTED_BAND)) {
      tasks.push({ q, qi, level, answer: String(q.generated[level] ?? '') });
    }
  });

  const graded = await mapLimit(tasks, CONCURRENCY, async (t) => {
    const res = await withRetry(
      () => callDeepSeek(buildGradingMessages(t.q, t.answer), { temperature: 0 }),
      `評分 Q${t.qi + 1}/${t.level}`
    );
    addUsage(res.usage);
    const r = parseJson(res.content);
    const [lo, hi] = EXPECTED_BAND[t.level];
    const score = Number(r.score);
    const inBand = score >= lo && score <= hi;
    const deviation = score < lo ? lo - score : score > hi ? score - hi : 0;
    console.log(
      `  ${inBand ? '✓' : '✗'} Q${t.qi + 1} ${LEVEL_LABEL[t.level]} → ${score} 分（預期 ${lo}~${hi}，信心 ${r.confidence}）`
    );
    return {
      questionIndex: t.qi + 1,
      department: t.q.department,
      process: t.q.process,
      level: t.q.level,
      content: t.q.content,
      reference: t.q.reference,
      answerLevel: t.level,
      studentAnswer: t.answer,
      score,
      expected: [lo, hi],
      inBand,
      deviation,
      confidence: r.confidence,
      reason: r.reason,
      keyPoints: r.keyPoints,
    };
  });

  // 3) 統計
  const total = graded.length;
  const hit = graded.filter((g) => g.inBand).length;
  const mae = graded.reduce((s, g) => s + g.deviation, 0) / total;
  const within2 = graded.filter((g) => g.deviation <= 2).length;

  const byLevel = {};
  for (const level of Object.keys(EXPECTED_BAND)) {
    const rows = graded.filter((g) => g.answerLevel === level);
    byLevel[level] = {
      label: LEVEL_LABEL[level],
      count: rows.length,
      inBand: rows.filter((r) => r.inBand).length,
      avgScore: Number((rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(1)),
    };
  }

  const confidence = graded.reduce((acc, g) => {
    acc[g.confidence] = (acc[g.confidence] ?? 0) + 1;
    return acc;
  }, {});

  console.log('\n──────── 實測結果 ────────');
  console.log(`樣本：${questions.length} 題 × 4 種作答品質 = ${total} 筆`);
  console.log(`落在預期分數區間：${hit}/${total}（${((hit / total) * 100).toFixed(0)}%）`);
  console.log(`偏離預期區間 ≤2 分：${within2}/${total}（${((within2 / total) * 100).toFixed(0)}%）`);
  console.log(`平均偏離分數（MAE）：${mae.toFixed(2)} 分`);
  console.log('\n各作答品質表現：');
  for (const [k, v] of Object.entries(byLevel)) {
    console.log(`  ${v.label}：命中 ${v.inBand}/${v.count}，平均給分 ${v.avgScore}`);
  }
  console.log(`\n信心度分布：${JSON.stringify(confidence)}`);

  const cost =
    (usage.prompt / 1_000_000) * 0.27 + (usage.completion / 1_000_000) * 1.1; // 粗估 USD
  console.log(
    `Token 用量：prompt ${usage.prompt} / completion ${usage.completion}（粗估 $${cost.toFixed(4)} USD）`
  );

  const report = {
    model: MODEL,
    generatedAt: new Date().toISOString(),
    sampleSize: questions.length,
    gradedCount: total,
    inBandRate: Number(((hit / total) * 100).toFixed(1)),
    within2Rate: Number(((within2 / total) * 100).toFixed(1)),
    mae: Number(mae.toFixed(2)),
    byLevel,
    confidence,
    usage,
    details: graded,
  };
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n完整明細已輸出：${path.relative(ROOT, outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
