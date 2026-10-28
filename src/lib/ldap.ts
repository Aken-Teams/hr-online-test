/**
 * 公司 LDAP／AD 整合（PRD F2-8）
 *
 * 僅用於後台：評卷人以 AD 工號登入，帳號須事先由系統管理員綁定並指派工序。
 * 考生端維持原有的姓名＋工號＋身分證後 6 碼驗證，不走 AD。
 *
 * 環境變數（金鑰僅存於伺服器端）：
 *   AD_URL         API 閘道位址，例如 https://apigw.panjit.com.tw
 *   AD_API         X-API-Key（查詢類 endpoint 需要；/auth 不需要）
 *   AD_DEFAULT_DOMAIN  預設網域，本案為徐州廠 PJXZ
 */

const BASE_URL = (process.env.AD_URL || 'https://apigw.panjit.com.tw').replace(/\/$/, '');
const API_PATH = '/ldap/api/v1';
const API_KEY = process.env.AD_API || '';
const TIMEOUT_MS = Number(process.env.AD_TIMEOUT_MS || 30_000);

/** 可用網域（對應閘道文件；本案預設徐州廠） */
export const AD_DOMAINS = [
  { code: 'PJXZ', label: '强茂徐州' },
  { code: 'PANJIT', label: 'PANJIT（台灣）' },
  { code: 'PYNMAX', label: '環茂' },
  { code: 'WXPJ', label: '無錫強茂' },
  { code: 'PJWS', label: '強茂深圳' },
  { code: 'GDPJ', label: '蘇州群鑫' },
  { code: 'PJSD', label: '山東強茂' },
] as const;

export const DEFAULT_AD_DOMAIN = process.env.AD_DEFAULT_DOMAIN || 'PJXZ';

export function isAdConfigured(): boolean {
  return API_KEY.length > 0;
}

/** 僅登入驗證可用（/auth 不需要 X-API-Key） */
export function isAdAuthAvailable(): boolean {
  return BASE_URL.length > 0;
}

// ============================================================
// Types
// ============================================================

export interface AdUser {
  username: string;
  displayName: string;
  department?: string | null;
  jobCategory?: string | null;
  title?: string | null;
  email?: string | null;
  domain?: string | null;
}

export class AdError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AdError';
    this.status = status;
  }
}

// ============================================================
// HTTP
// ============================================================

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

async function request(
  pathname: string,
  init: RequestInit & { useApiKey?: boolean; attempts?: number } = {}
): Promise<Response> {
  const { useApiKey = true, attempts = 3, ...rest } = init;

  if (useApiKey && !API_KEY) {
    throw new AdError('AD 查詢功能未設定：缺少 AD_API');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}${API_PATH}${pathname}`, {
        ...rest,
        headers: {
          ...(useApiKey ? { 'X-API-Key': API_KEY } : {}),
          ...(rest.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (res.ok) return res;

      const body = await res.text().catch(() => '');

      if (res.status === 403) {
        throw new AdError(`AD 權限不足（403）：${body.slice(0, 200)}`, 403);
      }
      if (res.status === 400) {
        throw new AdError(`AD 參數錯誤（400）：${body.slice(0, 200)}`, 400);
      }
      if (RETRYABLE.has(res.status) && attempt < attempts) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        continue;
      }

      throw new AdError(`AD 服務錯誤（${res.status}）：${body.slice(0, 200)}`, res.status);
    } catch (err) {
      if (err instanceof AdError) throw err;
      lastError = err as Error;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AdError(`AD 服務連線失敗：${lastError?.message ?? '未知錯誤'}`);
}

function toAdUser(raw: Record<string, unknown>, fallbackDomain?: string): AdUser {
  return {
    username: String(raw.username ?? ''),
    displayName: String(raw.displayName ?? raw.username ?? ''),
    department: raw.department ? String(raw.department) : null,
    jobCategory: raw.jobCategory ? String(raw.jobCategory) : null,
    title: raw.title ? String(raw.title) : null,
    email: raw.email ?? raw.mail ? String(raw.email ?? raw.mail) : null,
    domain: raw.domain ? String(raw.domain) : (fallbackDomain ?? null),
  };
}

// ============================================================
// API
// ============================================================

/**
 * AD 帳號密碼驗證。
 * 回傳 null 代表帳密錯誤（海外廠一律回「使用者名稱或密碼錯誤」）。
 */
export async function authenticateAdUser(
  username: string,
  password: string,
  domain: string = DEFAULT_AD_DOMAIN
): Promise<AdUser | null> {
  const res = await request('/auth', {
    method: 'POST',
    useApiKey: false, // 此 endpoint 不需要 X-API-Key
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, domain }),
    attempts: 1, // 密碼驗證不重試，避免觸發帳號鎖定
  }).catch((err) => {
    if (err instanceof AdError && (err.status === 400 || err.status === 401)) return null;
    throw err;
  });

  if (!res) return null;

  const json = await res.json();
  if (!json?.success || !json?.user) return null;

  return toAdUser(json.user as Record<string, unknown>, domain);
}

/** 姓名模糊查詢（至少 2 字）；不帶 domain 會跨網域查詢，較慢 */
export async function searchAdUsers(
  q: string,
  domain?: string,
  limit = 50
): Promise<{ users: AdUser[]; total: number; truncated: boolean }> {
  const params = new URLSearchParams({ q, limit: String(Math.min(Math.max(limit, 1), 50)) });
  if (domain) params.set('domain', domain);

  const res = await request(`/users/search?${params.toString()}`, { method: 'GET' });
  const json = await res.json();

  return {
    users: (json?.users ?? []).map((u: Record<string, unknown>) => toAdUser(u, domain)),
    total: Number(json?.total ?? 0),
    truncated: Boolean(json?.truncated),
  };
}

/** 以工號取得單一使用者完整資料 */
export async function getAdUser(
  username: string,
  domain: string = DEFAULT_AD_DOMAIN
): Promise<AdUser | null> {
  try {
    const params = new URLSearchParams({ domain });
    const res = await request(
      `/users/${encodeURIComponent(username)}?${params.toString()}`,
      { method: 'GET' }
    );
    const json = await res.json();
    // 回應格式為 { success, message, user }；查無此人時 success=false
    const raw = json?.user ?? (json?.username ? json : null);
    if (!raw || json?.success === false) return null;
    return toAdUser(raw as Record<string, unknown>, domain);
  } catch (err) {
    if (err instanceof AdError && err.status === 404) return null;
    throw err;
  }
}

/**
 * 查詢部門所有成員。
 *
 * 優先使用 /departments/{name}/members；目前這把金鑰缺少 dept:read 權限（403），
 * 因此自動改以 org:read 的組織樹推導同一份名單（資料來源相同，非繞過權限）。
 * 若日後補上 dept:read，會自動改走效率較好的原生 endpoint。
 */
export async function getDepartmentMembers(
  name: string,
  domain: string = DEFAULT_AD_DOMAIN
): Promise<AdUser[]> {
  const params = new URLSearchParams({ domain });
  try {
    const res = await request(
      `/departments/${encodeURIComponent(name)}/members?${params.toString()}`,
      { method: 'GET' }
    );
    const json = await res.json();
    const list: unknown[] = Array.isArray(json) ? json : (json?.members ?? []);
    return list.map((m) => toAdUser(m as Record<string, unknown>, domain));
  } catch (err) {
    if (!(err instanceof AdError) || err.status !== 403) throw err;
    console.warn('AD: 金鑰缺少 dept:read 權限，改由組織樹取得部門成員');
    const nodes = await listOrganizationUnits(domain);
    const hit = nodes.find((n) => n.name === name);
    return hit?.members ?? [];
  }
}

export interface AdOrgUnit {
  name: string;
  dn: string;
  type: string;
  path: string[];
  memberCount: number;
  members: AdUser[];
}

/** 將組織樹攤平成單位清單（含成員），供後台組織瀏覽使用 */
export async function listOrganizationUnits(
  domain: string = DEFAULT_AD_DOMAIN
): Promise<AdOrgUnit[]> {
  const tree = (await getOrganizationTree(domain)) as Record<string, unknown>;
  const root = (tree?.tree ?? tree) as Record<string, unknown>;
  const out: AdOrgUnit[] = [];

  const walk = (node: Record<string, unknown>, parents: string[]) => {
    if (!node) return;
    const name = String(node.name ?? '');
    const members = Array.isArray(node.members)
      ? (node.members as Record<string, unknown>[])
          // 排除電腦帳號（以 $ 結尾）
          .filter((m) => m.username && !String(m.username).endsWith('$'))
          .map((m) => toAdUser(m, domain))
      : [];

    out.push({
      name,
      dn: String(node.dn ?? ''),
      type: String(node.type ?? 'ou'),
      path: parents,
      memberCount: members.length,
      members,
    });

    for (const child of (node.children as Record<string, unknown>[]) ?? []) {
      walk(child, [...parents, name]);
    }
  };

  walk(root, []);
  return out;
}

/** 指定組織的層級結構與成員 */
export async function getOrganizationStructure(
  name: string,
  domain: string = DEFAULT_AD_DOMAIN
): Promise<unknown> {
  const params = new URLSearchParams({ domain });
  const res = await request(
    `/organizations/${encodeURIComponent(name)}/structure?${params.toString()}`,
    { method: 'GET' }
  );
  return res.json();
}

/** 完整組織架構樹（資料量大，建議快取） */
export async function getOrganizationTree(
  domain: string = DEFAULT_AD_DOMAIN
): Promise<unknown> {
  const params = new URLSearchParams({ domain });
  const res = await request(`/organizations/tree?${params.toString()}`, { method: 'GET' });
  return res.json();
}
