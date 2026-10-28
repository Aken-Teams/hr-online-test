/**
 * AI 輔助評分（PRD F3）
 *
 * 產生簡答題的「建議分數 + 評分依據 + 信心度」，供評卷人參考。
 * AI 不直接定分：建議分數在評卷人確認前不計入成績。
 *
 * 供應商採 OpenAI 相容的 /chat/completions 介面，因此雲端（DeepSeek）與
 * 地端模型（vLLM / Ollama / LM Studio 等）可透過環境變數切換，無需改程式：
 *   AI_GRADING_BASE_URL   預設 https://api.deepseek.com/v1
 *   AI_GRADING_MODEL      預設 deepseek-chat
 *   AI_GRADING_API_KEY    預設沿用 deepseek_api_key（地端可填任意值）
 *   AI_GRADING_ENABLED    設為 "false" 可整體停用 AI 初評
 *   AI_GRADING_MAX_TOKENS 預設 800；thinking 模型（如 gemma4）需 >= 1500
 *   AI_GRADING_JSON_MODE  預設 auto；設 "false" 可停用 response_format
 */

// ============================================================
// Config：地端優先、雲端備援
// ============================================================

export interface AiProvider {
  /** 顯示用名稱（primary = 地端，fallback = 雲端備援） */
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  /** 單次請求逾時；地端設短一點，逾時即改走雲端 */
  timeoutMs: number;
  /** 重試次數；地端設 1 可避免整批閱卷被拖慢 */
  maxAttempts: number;
}

const ENABLED = process.env.AI_GRADING_ENABLED !== 'false';
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// ── 熔斷器：地端連續失敗就暫時停用，避免整批閱卷每筆都等逾時 ──
const BREAKER_THRESHOLD = Number(process.env.AI_GRADING_BREAKER_THRESHOLD || 3);
const BREAKER_COOLDOWN_MS = Number(process.env.AI_GRADING_BREAKER_COOLDOWN_MS || 5 * 60_000);

// ── 品質守門：地端回應可疑時改向雲端取第二意見 ──
const QUALITY_CHECK = process.env.AI_GRADING_QUALITY_CHECK !== 'false';
/** 得分點數量上限；拆得過細代表模型理解失準（實測 gemma4 曾把 5 點拆成 11 點） */
const MAX_KEY_POINTS = Number(process.env.AI_GRADING_MAX_KEYPOINTS || 8);
/** 作答達此字數卻判 0 分視為可疑（過嚴誤判） */
const ZERO_SCORE_MIN_LENGTH = Number(process.env.AI_GRADING_ZERO_SCORE_MIN_LENGTH || 15);
/** 作答長度低於參考答案此比例卻判滿分視為可疑（過寬誤判） */
const FULL_SCORE_MIN_RATIO = Number(process.env.AI_GRADING_FULL_SCORE_MIN_RATIO || 0.25);

interface ProviderHealth {
  consecutiveFailures: number;
  openUntil: number;
  lastError?: string;
}
const health = new Map<string, ProviderHealth>();

function healthOf(provider: AiProvider): ProviderHealth {
  const key = `${provider.baseUrl}:${provider.model}`;
  if (!health.has(key)) health.set(key, { consecutiveFailures: 0, openUntil: 0 });
  return health.get(key)!;
}

function recordFailure(provider: AiProvider, reason: string) {
  const h = healthOf(provider);
  h.consecutiveFailures += 1;
  h.lastError = reason;
  if (h.consecutiveFailures >= BREAKER_THRESHOLD) {
    h.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    console.warn(
      `AI grading: ${provider.model} 連續失敗 ${h.consecutiveFailures} 次，暫停使用 ${Math.round(BREAKER_COOLDOWN_MS / 1000)} 秒`
    );
  }
}

function recordSuccess(provider: AiProvider) {
  const h = healthOf(provider);
  h.consecutiveFailures = 0;
  h.openUntil = 0;
  h.lastError = undefined;
}

function isBreakerOpen(provider: AiProvider): boolean {
  return healthOf(provider).openUntil > Date.now();
}

/**
 * 判斷地端回應是否可疑，需要向雲端取第二意見。
 * 只看結構性訊號，不做語意判斷，避免誤判。
 */
function isSuspicious(
  suggestion: AiGradingSuggestion,
  input: AiGradingInput
): string | null {
  // 結構性訊號
  if (suggestion.keyPoints.length === 0) return '未產出得分點';
  if (suggestion.keyPoints.length > MAX_KEY_POINTS)
    return `得分點拆得過細（${suggestion.keyPoints.length} 點）`;
  if (suggestion.confidence === 'low') return '模型自評信心度低';
  if (!suggestion.reason) return '未提供評分依據';

  // 極端分數：實測地端偶有「認真作答卻全不命中」或「寥寥數字卻給滿分」的誤判
  const answerLength = (input.studentAnswer ?? '').trim().length;
  const referenceLength = (input.referenceAnswer ?? '').trim().length;

  if (suggestion.score === 0 && answerLength >= ZERO_SCORE_MIN_LENGTH) {
    return `作答 ${answerLength} 字卻判 0 分`;
  }
  if (
    suggestion.score === input.maxPoints &&
    referenceLength > 0 &&
    answerLength < referenceLength * FULL_SCORE_MIN_RATIO
  ) {
    return `作答僅 ${answerLength} 字卻判滿分`;
  }

  return null;
}

/** 併發數：地端為單機推理，建議 1~2；雲端可拉高 */
export const AI_GRADING_CONCURRENCY = Number(process.env.AI_GRADING_CONCURRENCY || 4);

/** 部分地端閘道不支援 response_format；依供應商各自記錄是否支援 */
const jsonModeByProvider = new Map<string, boolean>();

function buildProviders(): AiProvider[] {
  const providers: AiProvider[] = [];

  // 主要供應商（預設地端；未設定時退回 DeepSeek 雲端）
  const primaryKey = process.env.AI_GRADING_API_KEY || process.env.deepseek_api_key || '';
  if (primaryKey) {
    providers.push({
      name: 'primary',
      baseUrl: (process.env.AI_GRADING_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
      model: process.env.AI_GRADING_MODEL || 'deepseek-chat',
      apiKey: primaryKey,
      maxTokens: Number(process.env.AI_GRADING_MAX_TOKENS || 800),
      // 地端逾時設短：超過代表卡住，直接改走雲端比乾等划算
      timeoutMs: Number(process.env.AI_GRADING_PRIMARY_TIMEOUT_MS || 45_000),
      maxAttempts: Number(process.env.AI_GRADING_PRIMARY_MAX_ATTEMPTS || 2),
    });
  }

  // 備援供應商：地端異常、逾時或回應無法解析時自動接手
  const fallbackKey = process.env.AI_GRADING_FALLBACK_API_KEY || process.env.deepseek_api_key || '';
  const fallbackBase = (
    process.env.AI_GRADING_FALLBACK_BASE_URL || 'https://api.deepseek.com/v1'
  ).replace(/\/$/, '');
  const fallbackModel = process.env.AI_GRADING_FALLBACK_MODEL || 'deepseek-chat';
  const sameAsPrimary =
    providers[0]?.baseUrl === fallbackBase && providers[0]?.model === fallbackModel;

  if (fallbackKey && !sameAsPrimary && process.env.AI_GRADING_FALLBACK_ENABLED !== 'false') {
    providers.push({
      name: 'fallback',
      baseUrl: fallbackBase,
      model: fallbackModel,
      apiKey: fallbackKey,
      maxTokens: Number(process.env.AI_GRADING_FALLBACK_MAX_TOKENS || 800),
      timeoutMs: Number(process.env.AI_GRADING_FALLBACK_TIMEOUT_MS || 60_000),
      maxAttempts: Number(process.env.AI_GRADING_FALLBACK_MAX_ATTEMPTS || 3),
    });
  }

  return providers;
}

const PROVIDERS = buildProviders();

/** 目前設定的供應商（供後台顯示與診斷用，不含金鑰） */
export function getAiProviders(): {
  name: string;
  baseUrl: string;
  model: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastError?: string;
}[] {
  return PROVIDERS.map((p) => {
    const h = healthOf(p);
    return {
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      healthy: !isBreakerOpen(p),
      consecutiveFailures: h.consecutiveFailures,
      lastError: h.lastError,
    };
  });
}

/** AI 初評是否可用（未設定金鑰或已停用時為 false，閱卷改走全人工） */
export function isAiGradingEnabled(): boolean {
  return ENABLED && PROVIDERS.length > 0;
}

// ============================================================
// Types
// ============================================================

export type AiConfidence = 'high' | 'medium' | 'low';

export interface AiKeyPoint {
  /** 得分點描述 */
  point: string;
  /** 考生作答是否命中 */
  hit: boolean;
}

export interface AiGradingSuggestion {
  score: number;
  keyPoints: AiKeyPoint[];
  reason: string;
  confidence: AiConfidence;
  /** 實際產生此建議的模型 */
  model: string;
  /** 是否因主要供應商回應可疑而改由備援重新評分 */
  secondOpinion?: boolean;
  /** 被取代的主要供應商模型（僅 secondOpinion 時有值） */
  replacedModel?: string;
  /** 本次耗時（毫秒），供效能監控用 */
  elapsedMs?: number;
}

export interface AiGradingInput {
  /** 題目內容 */
  content: string;
  /** 參考答案（無參考答案時不呼叫 AI，直接回 null） */
  referenceAnswer?: string | null;
  /** 評分要點／評分標準（選填） */
  gradingRubric?: string | null;
  /** 考生作答 */
  studentAnswer?: string | null;
  /** 本題在該場考試的配分 */
  maxPoints: number;
}

// ============================================================
// Prompt
// ============================================================

function buildSystemPrompt(maxPoints: number): string {
  return `你是半導體封裝廠技能考核的簡答題閱卷老師，依據「參考答案」為考生作答評分。

評分規則：
1. 先把參考答案拆成數個「得分點」（通常 2~5 個）。
2. 逐一判斷考生作答是否命中各得分點；意思正確即可命中，不要求用字相同，錯別字不扣分。
2-1. 先確認考生是否在回答本題：若作答描述的是相反流程或不同情境（例如題目問關機順序卻回答開機順序），即使出現相同的關鍵字，所有得分點一律判為未命中。
3. 總分 ${maxPoints} 分，依「命中得分點數 ÷ 總得分點數 × ${maxPoints}」計算，**四捨五入到整數，允許部分分數**（例如 2 個得分點命中 1 個、滿分 2 分＝1 分）。只要命中任一得分點，至少給 1 分。
4. 參考答案若只有 1 個得分點，則答對給滿分、答錯給 0 分，不給中間分。
5. 空白、與題目無關、或明顯胡謅者給 0 分。
6. 僅依參考答案判斷，不要自行補充廠內未提及的知識；考生語氣不確定但內容正確者仍算命中。
7. confidence 表示你對此分數的把握：high / medium / low。作答模糊、參考答案過於簡略、或需要現場實務知識才能判斷時給 low。

回傳 JSON：
{
  "score": 0 到 ${maxPoints} 的整數,
  "keyPoints": [{"point": "得分點描述", "hit": true}],
  "reason": "一句話說明命中與未命中的內容（繁體中文，40 字內，不要提及分數）",
  "confidence": "high"
}
只回 JSON，不要其他文字。`;
}

function buildUserPrompt(input: AiGradingInput): string {
  const lines = [`【題目】${input.content}`, `【參考答案】${input.referenceAnswer ?? ''}`];
  if (input.gradingRubric) lines.push(`【評分要點】${input.gradingRubric}`);
  lines.push(`【考生作答】${input.studentAnswer?.trim() || '（空白）'}`);
  return lines.join('\n');
}

// ============================================================
// Core
// ============================================================

function parseJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 由得分點命中率推導分數。
 *
 * 實測發現模型「判斷得分點是否命中」相當準確，但自行換算分數時偏寬
 * （例如 3 個得分點只命中 2 個仍給滿分）。因此語意判斷交給模型、
 * 分數由程式計算，評分尺度才會穩定且可解釋。
 *
 * - 單一得分點：全有全無（命中給滿分、未命中給 0）
 * - 多個得分點：命中比例 × 滿分，四捨五入到整數（允許部分分，不再強制偶數）
 */
export function computeScoreFromKeyPoints(
  keyPoints: AiKeyPoint[],
  maxPoints: number
): number {
  if (keyPoints.length === 0) return 0;
  const hits = keyPoints.filter((kp) => kp.hit).length;
  if (hits === 0) return 0;
  if (hits === keyPoints.length) return maxPoints;
  if (keyPoints.length === 1) return maxPoints;
  const raw = (hits / keyPoints.length) * maxPoints;
  // 命中部分得分点就至少给 1 分，避免「命中一半却 0 分」的过严情形
  return Math.max(1, Math.min(maxPoints, Math.round(raw)));
}

function normalizeSuggestion(
  raw: Record<string, unknown>,
  maxPoints: number,
  model: string
): AiGradingSuggestion | null {
  const rawScore = Number(raw.score);
  if (!Number.isFinite(rawScore)) return null;

  const keyPoints: AiKeyPoint[] = Array.isArray(raw.keyPoints)
    ? (raw.keyPoints as unknown[])
        .map((kp) => {
          const obj = kp as Record<string, unknown>;
          return { point: String(obj?.point ?? '').trim(), hit: Boolean(obj?.hit) };
        })
        .filter((kp) => kp.point.length > 0)
    : [];

  // 有得分點就以命中率計分；模型未回傳得分點時才退回模型自評的分數
  const score =
    keyPoints.length > 0
      ? computeScoreFromKeyPoints(keyPoints, maxPoints)
      : Math.min(maxPoints, Math.round(Math.max(0, Math.min(rawScore, maxPoints))));

  const confidenceRaw = String(raw.confidence ?? '').toLowerCase();
  const confidence: AiConfidence =
    confidenceRaw === 'high' || confidenceRaw === 'low' ? confidenceRaw : 'medium';

  return {
    score,
    keyPoints,
    reason: String(raw.reason ?? '').trim().slice(0, 200),
    confidence,
    model,
  };
}

/**
 * 產生單筆簡答題的 AI 建議分數。
 *
 * 回傳 null 代表「本次無法提供建議」（未啟用、無參考答案、服務異常或回應格式錯誤），
 * 呼叫端應自動降級為全人工評分，不可中斷閱卷流程。
 */
export async function suggestShortAnswerGrade(
  input: AiGradingInput
): Promise<AiGradingSuggestion | null> {
  if (!isAiGradingEnabled()) return null;
  if (!input.referenceAnswer || input.referenceAnswer.trim() === '') return null;
  if (!input.content || input.maxPoints <= 0) return null;

  const messages = [
    { role: 'system', content: buildSystemPrompt(input.maxPoints) },
    { role: 'user', content: buildUserPrompt(input) },
  ];

  // 地端優先、雲端備援。切換時機有三：
  //   ① 技術性失敗（錯誤／逾時／回應無法解析）
  //   ② 熔斷：連續失敗達門檻後，冷卻期內直接跳過該供應商，不再逐筆等逾時
  //   ③ 品質可疑：回應結構異常（得分點為空／拆太細／低信心）時向雲端取第二意見
  for (let i = 0; i < PROVIDERS.length; i += 1) {
    const provider = PROVIDERS[i];

    if (isBreakerOpen(provider)) {
      console.warn(`AI grading: ${provider.model} 處於熔斷冷卻中，直接改用下一個供應商`);
      continue;
    }

    const startedAt = Date.now();
    const suggestion = await callProvider(provider, messages, input.maxPoints);

    if (!suggestion) {
      recordFailure(provider, '無法取得有效回應');
      console.warn(`AI grading: 供應商 ${provider.model} 無法提供建議，嘗試下一個`);
      continue;
    }

    recordSuccess(provider);

    if (i > 0) {
      console.warn(`AI grading: 已改用備援供應商 ${provider.model}`);
      return suggestion;
    }

    // 品質守門：僅在還有備援可用時才值得多問一次
    const nextProvider = PROVIDERS[i + 1];
    if (QUALITY_CHECK && nextProvider && !isBreakerOpen(nextProvider)) {
      const doubt = isSuspicious(suggestion, input);
      if (doubt) {
        console.warn(
          `AI grading: ${provider.model} 回應可疑（${doubt}），向 ${nextProvider.model} 取第二意見`
        );
        const second = await callProvider(nextProvider, messages, input.maxPoints);
        if (second) {
          recordSuccess(nextProvider);
          return { ...second, secondOpinion: true, replacedModel: provider.model };
        }
        recordFailure(nextProvider, '第二意見取得失敗');
      }
    }

    return { ...suggestion, elapsedMs: Date.now() - startedAt };
  }

  // 全部供應商皆失敗 → 降級為全人工評分
  return null;
}

/** 對單一供應商發出請求；失敗回傳 null 由上層決定是否切換 */
async function callProvider(
  provider: AiProvider,
  messages: { role: string; content: string }[],
  maxPoints: number
): Promise<AiGradingSuggestion | null> {
  const jsonModeKey = `${provider.baseUrl}:${provider.model}`;
  if (!jsonModeByProvider.has(jsonModeKey)) {
    jsonModeByProvider.set(jsonModeKey, process.env.AI_GRADING_JSON_MODE !== 'false');
  }

  // 模型閒置時首次呼叫需載入，可能回 503 —— 以指數退避重試
  const maxAttempts = provider.maxAttempts;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);

    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0,
          max_tokens: provider.maxTokens,
          stream: false, // thinking 模型的 stream 模式會夾帶原始 harmony tokens
          ...(jsonModeByProvider.get(jsonModeKey)
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');

        // 閘道不支援 response_format → 關閉後立即重試
        if (res.status === 400 && jsonModeByProvider.get(jsonModeKey) && /response_format/i.test(body)) {
          console.warn(`AI grading: ${provider.model} 不支援 response_format，改以純文字模式重試`);
          jsonModeByProvider.set(jsonModeKey, false);
          continue;
        }

        if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
          const waitMs = 2000 * attempt;
          console.warn(
            `AI grading（${provider.model}）：${res.status}，${waitMs}ms 後重試（${attempt}/${maxAttempts}）`
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        console.error(`AI grading error（${provider.model}）:`, res.status, body.slice(0, 300));
        return null;
      }

      const json = await res.json();
      const message = json?.choices?.[0]?.message ?? {};
      // thinking 模型的 content 可能為空字串，答案落在 gateway 額外回傳的 reasoning
      const content: string = message.content || message.reasoning || '';
      const parsed = parseJsonObject(content);
      if (!parsed) {
        console.error(
          `AI grading（${provider.model}）: response was not JSON:`,
          content.slice(0, 200)
        );
        return null;
      }

      return normalizeSuggestion(parsed, maxPoints, provider.model);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      if (attempt < maxAttempts) {
        const waitMs = 2000 * attempt;
        console.warn(
          `AI grading（${provider.model}）${timedOut ? 'timeout' : 'failed'}，${waitMs}ms 後重試（${attempt}/${maxAttempts}）`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.error(
        timedOut
          ? `AI grading timeout（${provider.model}）`
          : `AI grading failed（${provider.model}）:`,
        timedOut ? '' : err
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/** 批次產生建議分數，限制併發數避免拖垮服務 */
export async function suggestShortAnswerGrades<T>(
  items: T[],
  toInput: (item: T) => AiGradingInput,
  concurrency = AI_GRADING_CONCURRENCY
): Promise<(AiGradingSuggestion | null)[]> {
  const results: (AiGradingSuggestion | null)[] = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await suggestShortAnswerGrade(toInput(items[index]));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}
