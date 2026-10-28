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
// Config
// ============================================================

const BASE_URL = (process.env.AI_GRADING_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_GRADING_MODEL || 'deepseek-chat';
const API_KEY = process.env.AI_GRADING_API_KEY || process.env.deepseek_api_key || '';
const ENABLED = process.env.AI_GRADING_ENABLED !== 'false';
const TIMEOUT_MS = Number(process.env.AI_GRADING_TIMEOUT_MS || 120_000);
const MAX_TOKENS = Number(process.env.AI_GRADING_MAX_TOKENS || 800);
/** 部分地端閘道不支援 response_format，首次 400 後自動停用並重試 */
let jsonModeSupported = process.env.AI_GRADING_JSON_MODE !== 'false';
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** AI 初評是否可用（未設定金鑰或已停用時為 false，閱卷改走全人工） */
export function isAiGradingEnabled(): boolean {
  return ENABLED && API_KEY.length > 0;
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
  model: string;
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
3. 總分 ${maxPoints} 分，依「命中得分點數 ÷ 總得分點數 × ${maxPoints}」計算，**向下取整到偶數**（例如 3 個得分點命中 2 個＝6 分，不是 8 分）。
4. 參考答案若只有 1 個得分點，則答對給滿分、答錯給 0 分，不給中間分。
5. 空白、與題目無關、或明顯胡謅者給 0 分。
6. 僅依參考答案判斷，不要自行補充廠內未提及的知識；考生語氣不確定但內容正確者仍算命中。
7. confidence 表示你對此分數的把握：high / medium / low。作答模糊、參考答案過於簡略、或需要現場實務知識才能判斷時給 low。

回傳 JSON：
{
  "score": 0 到 ${maxPoints} 的偶數,
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
 * - 多個得分點：命中比例 × 滿分，向下取整到偶數
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
  return Math.max(0, Math.min(maxPoints, Math.floor(raw / 2) * 2));
}

function normalizeSuggestion(
  raw: Record<string, unknown>,
  maxPoints: number
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
      : Math.min(maxPoints, Math.round(Math.max(0, Math.min(rawScore, maxPoints)) / 2) * 2);

  const confidenceRaw = String(raw.confidence ?? '').toLowerCase();
  const confidence: AiConfidence =
    confidenceRaw === 'high' || confidenceRaw === 'low' ? confidenceRaw : 'medium';

  return {
    score,
    keyPoints,
    reason: String(raw.reason ?? '').trim().slice(0, 200),
    confidence,
    model: MODEL,
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

  // 模型閒置時首次呼叫需載入，可能回 503 —— 以指數退避重試
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0,
          max_tokens: MAX_TOKENS,
          stream: false, // thinking 模型的 stream 模式會夾帶原始 harmony tokens
          ...(jsonModeSupported ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');

        // 閘道不支援 response_format → 關閉後立即重試
        if (res.status === 400 && jsonModeSupported && /response_format/i.test(body)) {
          console.warn('AI grading: 端點不支援 response_format，改以純文字模式重試');
          jsonModeSupported = false;
          continue;
        }

        if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
          const waitMs = 2000 * attempt;
          console.warn(`AI grading: ${res.status}，${waitMs}ms 後重試（${attempt}/${maxAttempts}）`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        console.error('AI grading error:', res.status, body.slice(0, 300));
        return null;
      }

      const json = await res.json();
      const message = json?.choices?.[0]?.message ?? {};
      // thinking 模型的 content 可能為空字串，答案落在 gateway 額外回傳的 reasoning
      const content: string = message.content || message.reasoning || '';
      const parsed = parseJsonObject(content);
      if (!parsed) {
        console.error('AI grading: response was not JSON:', content.slice(0, 200));
        return null;
      }

      return normalizeSuggestion(parsed, input.maxPoints);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      if (attempt < maxAttempts) {
        const waitMs = 2000 * attempt;
        console.warn(
          `AI grading ${timedOut ? 'timeout' : 'failed'}，${waitMs}ms 後重試（${attempt}/${maxAttempts}）`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.error(timedOut ? 'AI grading timeout' : 'AI grading failed:', timedOut ? '' : err);
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
  concurrency = 4
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
