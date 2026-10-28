/**
 * 私有 AI 閘道的 OCR 整合（OpenAI 相容端點，非 OpenAI 官方服務）
 *
 * 將 PDF 或圖片轉成文字。多頁 PDF 一律走非同步流程：
 *   1. POST /ocr/submit            取得 job_id
 *   2. GET  /ocr/jobs/{job_id}     輪詢至 status = done / error
 * 小圖可用同步的 POST /ocr/recognize。
 *
 * 環境變數（金鑰只存在伺服器端，前端不得接觸）：
 *   PRIVATE_AI_BASE_URL  預設 https://ollamapjapi.theaken.com/v1
 *   PRIVATE_AI_API_KEY   閘道金鑰
 *   OCR_ENGINE           OCR 引擎 id，預設 paddleocr-remote
 */

// ============================================================
// Config
// ============================================================

const BASE_URL = (
  process.env.PRIVATE_AI_BASE_URL || 'https://ollamapjapi.theaken.com/v1'
).replace(/\/$/, '');
const API_KEY = process.env.PRIVATE_AI_API_KEY || '';
const DEFAULT_ENGINE = process.env.OCR_ENGINE || 'paddleocr-remote';
const REQUEST_TIMEOUT_MS = Number(process.env.OCR_REQUEST_TIMEOUT_MS || 120_000);

/** OCR 是否已設定（未設定金鑰時呼叫端應顯示「功能未啟用」而非報錯） */
export function isOcrConfigured(): boolean {
  return API_KEY.length > 0;
}

export function getOcrEngineId(): string {
  return DEFAULT_ENGINE;
}

// ============================================================
// Types
// ============================================================

export interface OcrEngine {
  id: string;
  available: boolean;
  description?: string;
}

export type OcrJobStatus = 'queued' | 'processing' | 'done' | 'error' | string;

export interface OcrJob {
  jobId: string;
  status: OcrJobStatus;
  /** 辨識結果純文字（status = done 時提供） */
  text?: string;
  /** 逐頁結果（若引擎有回傳） */
  pages?: { page: number; text: string }[];
  progress?: number;
  error?: string;
  raw: Record<string, unknown>;
}

/** 權限不足（403）：不可自動改用其他引擎繞過，須回報使用者 */
export class OcrPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrPermissionError';
  }
}

export class OcrError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'OcrError';
    this.status = status;
  }
}

// ============================================================
// HTTP helper
// ============================================================

/** 模型載入中會回 503；對暫時性錯誤以指數退避重試 */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

async function request(
  pathname: string,
  init: RequestInit & { attempts?: number } = {}
): Promise<Response> {
  if (!isOcrConfigured()) {
    throw new OcrError('OCR 服務未設定：缺少 PRIVATE_AI_API_KEY');
  }

  const attempts = init.attempts ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}${pathname}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (res.ok) return res;

      const body = await res.text().catch(() => '');

      if (res.status === 403) {
        throw new OcrPermissionError(
          `OCR 權限不足（403）：這把金鑰沒有此引擎或功能的權限。${body.slice(0, 200)}`
        );
      }

      if (RETRYABLE_STATUS.has(res.status) && attempt < attempts) {
        // 閒置模型首次呼叫需載入，等待後重試
        const waitMs = 2000 * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      throw new OcrError(`OCR 服務錯誤（${res.status}）：${body.slice(0, 300)}`, res.status);
    } catch (err) {
      if (err instanceof OcrPermissionError || err instanceof OcrError) throw err;
      lastError = err as Error;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new OcrError(`OCR 服務連線失敗：${lastError?.message ?? '未知錯誤'}`);
}

// ============================================================
// API
// ============================================================

/** 取得可用引擎清單（不要寫死清單，available=false 代表目前離線） */
export async function listOcrEngines(): Promise<OcrEngine[]> {
  const res = await request('/ocr/models', { method: 'GET' });
  const json = await res.json();
  const list: unknown[] = Array.isArray(json) ? json : (json?.data ?? json?.models ?? []);

  return list.map((item) => {
    const obj = item as Record<string, unknown>;
    return {
      id: String(obj.id ?? obj.model ?? obj.name ?? ''),
      available: obj.available !== false,
      description: obj.description ? String(obj.description) : undefined,
    };
  });
}

function toFormData(file: Blob, filename: string, engine: string): FormData {
  const form = new FormData();
  form.append('file', file, filename);
  form.append('model', engine);
  return form;
}

/** 送出 OCR 工作，取得 job_id（多頁 PDF 使用） */
export async function submitOcrJob(
  file: Blob,
  filename: string,
  engine: string = DEFAULT_ENGINE
): Promise<string> {
  const res = await request('/ocr/submit', {
    method: 'POST',
    body: toFormData(file, filename, engine),
  });
  const json = await res.json();
  const jobId = json?.job_id ?? json?.jobId ?? json?.id;
  if (!jobId) {
    throw new OcrError(`OCR 送出成功但未取得 job_id：${JSON.stringify(json).slice(0, 200)}`);
  }
  return String(jobId);
}

function normalizeJob(jobId: string, json: Record<string, unknown>): OcrJob {
  const status = String(json.status ?? json.state ?? 'processing') as OcrJobStatus;
  const pagesRaw = json.pages ?? json.results;
  const pages = Array.isArray(pagesRaw)
    ? pagesRaw.map((p, i) => {
        const obj = p as Record<string, unknown>;
        return {
          page: Number(obj.page ?? i + 1),
          text: String(obj.text ?? obj.content ?? ''),
        };
      })
    : undefined;

  const text =
    typeof json.text === 'string'
      ? json.text
      : typeof json.result === 'string'
        ? json.result
        : pages?.map((p) => p.text).join('\n');

  return {
    jobId,
    status,
    text,
    pages,
    progress: typeof json.progress === 'number' ? json.progress : undefined,
    error: json.error ? String(json.error) : undefined,
    raw: json,
  };
}

/** 查詢單一 OCR 工作狀態 */
export async function getOcrJob(jobId: string): Promise<OcrJob> {
  const res = await request(`/ocr/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
  return normalizeJob(jobId, await res.json());
}

/**
 * 輪詢直到完成或失敗。
 * 大檔可能跑數分鐘，間隔自 2 秒起逐步拉長（上限 10 秒）。
 */
export async function waitForOcrJob(
  jobId: string,
  options: {
    initialIntervalMs?: number;
    maxIntervalMs?: number;
    timeoutMs?: number;
    onProgress?: (job: OcrJob) => void;
  } = {}
): Promise<OcrJob> {
  const {
    initialIntervalMs = 2000,
    maxIntervalMs = 10_000,
    timeoutMs = Number(process.env.OCR_JOB_TIMEOUT_MS || 15 * 60_000),
    onProgress,
  } = options;

  const startedAt = Date.now();
  let interval = initialIntervalMs;

  for (;;) {
    const job = await getOcrJob(jobId);
    onProgress?.(job);

    if (job.status === 'done') return job;
    if (job.status === 'error' || job.status === 'failed') {
      throw new OcrError(`OCR 工作失敗：${job.error ?? '未提供原因'}`);
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new OcrError(`OCR 工作逾時（${Math.round(timeoutMs / 1000)} 秒）：job ${jobId}`);
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(Math.round(interval * 1.5), maxIntervalMs);
  }
}

/** 同步辨識（僅建議用於單張小圖；多頁 PDF 請走 ocrFileToText） */
export async function recognizeImageSync(
  file: Blob,
  filename: string,
  engine: string = DEFAULT_ENGINE
): Promise<string> {
  const res = await request('/ocr/recognize', {
    method: 'POST',
    body: toFormData(file, filename, engine),
  });
  const json = await res.json();
  if (typeof json?.text === 'string') return json.text;
  if (typeof json?.result === 'string') return json.result;
  if (Array.isArray(json?.results)) {
    return json.results
      .map((r: Record<string, unknown>) => String(r.text ?? r.content ?? ''))
      .join('\n');
  }
  return '';
}

/** 送出 + 輪詢的組合流程，回傳辨識後的純文字 */
export async function ocrFileToText(
  file: Blob,
  filename: string,
  options: { engine?: string; onProgress?: (job: OcrJob) => void } = {}
): Promise<{ jobId: string; text: string; pages?: { page: number; text: string }[] }> {
  const jobId = await submitOcrJob(file, filename, options.engine ?? DEFAULT_ENGINE);
  const job = await waitForOcrJob(jobId, { onProgress: options.onProgress });
  return { jobId, text: job.text ?? '', pages: job.pages };
}
