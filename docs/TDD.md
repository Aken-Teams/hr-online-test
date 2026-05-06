# 智考雲 — 技術設計文件 (TDD - Technical Design Document)

**文件版本**：v1.0
**建立時間**：2026/05/05
**專案名稱**：智考雲 — 企業員工線上考核平台

---

## 1. 系統架構概覽

### 1.1 技術棧

| 層級 | 技術選型 | 版本 |
|------|---------|------|
| 前端框架 | Next.js (App Router) | 16.2.3 |
| UI 框架 | React | 19.2.4 |
| 程式語言 | TypeScript | 5.x |
| 樣式框架 | Tailwind CSS | 4.x |
| 狀態管理 | Zustand (含 localStorage 持久化) | 5.0.12 |
| 資料庫 | MySQL + Prisma ORM | Prisma 5.22.0 |
| 身份驗證 | JWT (jose) + bcrypt | jose 6.2.2 |
| 人臉辨識 | face-api.js | 0.22.2 |
| 圖表庫 | Recharts | 3.8.1 |
| Excel 處理 | SheetJS (xlsx) | 0.18.5 |
| 即時推送 | Server-Sent Events (SSE) | 原生 |
| 資料驗證 | Zod | 4.3.6 |
| 圖示庫 | Lucide React | 1.8.0 |

### 1.2 架構圖

```
┌───────────────────────────────────────────────────────────┐
│                     Client Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐│
│  │  考生端 SPA  │  │  管理端 SPA  │  │ React Native App ││
│  │ (手機優先)   │  │  (桌面優先)  │  │  (FLAG_SECURE)   ││
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘│
└─────────┼─────────────────┼───────────────────┼──────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌───────────────────────────────────────────────────────────┐
│                   Next.js App Router                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              API Route Handlers                      │ │
│  │  /api/auth/*    /api/exam/*    /api/admin/*          │ │
│  │  /api/upload/*  /api/cron/*                          │ │
│  └──────────────────────┬───────────────────────────────┘ │
│  ┌──────────────────────┼───────────────────────────────┐ │
│  │            Service / Library Layer                    │ │
│  │  auth.ts  scoring.ts  excel.ts  validators.ts        │ │
│  │  exam-status-sync.ts  exam-batch.ts  deepseek.ts     │ │
│  └──────────────────────┬───────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
                          ▼
┌───────────────────────────────────────────────────────────┐
│                   Data Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Prisma ORM │  │    MySQL     │  │  File Storage  │  │
│  │  (Query/TX)  │  │  (primary)   │  │  (/uploads/)   │  │
│  └──────────────┘  └──────────────┘  └────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 1.3 目錄結構

```
hr-online-test/
├── src/
│   ├── app/
│   │   ├── (exam)/          # 考生端頁面 (身份驗證、考試、成績)
│   │   ├── admin/           # 管理端頁面 (題庫、考試、員工、報表)
│   │   └── api/             # API Route Handlers (46 個端點)
│   ├── components/
│   │   ├── shared/          # 共用元件 (AntiCheat, ExamWatermark, etc.)
│   │   └── ui/              # UI 基礎元件 (Button, Card, Dialog, etc.)
│   ├── hooks/               # 自訂 Hooks (useAutoSave, useTimer, etc.)
│   ├── lib/                 # 核心工具庫 (auth, scoring, excel, etc.)
│   ├── stores/              # Zustand 狀態管理
│   └── types/               # TypeScript 型別定義
├── prisma/
│   ├── schema.prisma        # 資料庫模型定義
│   └── migrations/          # 資料庫遷移記錄
├── public/                  # 靜態資源 (模型檔案、上傳檔案)
├── scripts/                 # 維運腳本 (seed, clear, inspect)
├── mobile/                  # React Native App (Android/iOS)
└── docs/                    # 專案文件
```

---

## 2. 資料庫設計

### 2.1 ER 關係圖

```
User ──1:N── ExamAssignment ──N:1── Exam
  │                │                  │
  │                │                  ├──1:N── ExamBatch
  │                ▼                  ├──1:N── ExamQuestionRule
  │          ExamSession ──1:N── Answer ──N:1── Question ──1:N── QuestionOption
  │                │                                │
  │                ▼                                ├──1:N── QuestionTag
  │          ExamResult                             └──N:1── ExamQuestion
  │
Admin ──1:N── AuditLog
```

### 2.2 核心模型

#### User (員工)
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | String (CUID) | 主鍵 |
| employeeNo | String (Unique) | 工號 |
| name | String | 姓名 |
| idCardLast6 | String | 身份證後6位（AES-256加密） |
| department | String | 部門 |
| subDepartment | String? | 子部門 |
| role | String | 崗位 |
| photoUrl | String? | 照片路徑 |
| faceDescriptor | String? | 人臉特徵向量 (JSON) |
| verificationCode | String? | 驗證碼 (bcrypt) |
| isActive | Boolean | 在職狀態 |

#### Question (題目)
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | String (UUID) | 主鍵 |
| type | QuestionType Enum | 題型 (SINGLE_CHOICE/MULTI_CHOICE/TRUE_FALSE/...) |
| content | Text | 題目內容 |
| level | String | 難度級別 |
| department | String | 所屬部門 |
| process | String? | 工序 (SAW/DB/WB/...) |
| category | String | 分類 (BASIC/PROFESSIONAL) |
| correctAnswer | String? | 正確答案 |
| isMultiSelect | Boolean | 是否多選 |
| examSourceId | String? | 關聯考試 ID |
| sourceFile | String? | 來源檔案名 |

#### Exam (考試)
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | String (CUID) | 主鍵 |
| title | String | 考試標題 |
| timeLimitMinutes | Int | 時限（分鐘） |
| passScore | Int | 及格分 |
| totalScore | Int | 總分 |
| status | ExamStatus Enum | 狀態 (DRAFT→PUBLISHED→ACTIVE→CLOSED→ARCHIVED) |
| theoryWeight | Float | 理論權重（預設 0.4） |
| practicalWeight | Float | 實操權重（預設 0.6） |
| compositePassScore | Int | 綜合合格分（預設 90） |
| basicQuestionRatio | Float | 基本題比例（預設 0.1） |
| openAt / closeAt | DateTime? | 開放/關閉時間 |
| resultQueryOpenAt / resultQueryCloseAt | DateTime? | 成績查詢開放時間窗口 |

#### ExamAssignment (考試指派)
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | String (CUID) | 主鍵 |
| examId | String (FK) | 考試 ID |
| userId | String? (FK) | 員工 ID |
| process | String? | 工序 |
| level | String? | 級別 |
| department | String? | 部門 |

#### ExamSession (考試場次)
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | String (CUID) | 主鍵 |
| examId | String (FK) | 考試 ID |
| userId | String (FK) | 員工 ID |
| assignmentId | String? (FK) | 指派 ID |
| batchId | String? (FK) | 梯次 ID |
| status | SessionStatus Enum | 狀態 |
| startedAt / submittedAt | DateTime? | 開始/交卷時間 |
| tabSwitchCount | Int | 切屏次數 |
| attemptNumber | Int | 第幾次應試 |

### 2.3 索引策略

- `User`: employeeNo (UNIQUE), [department, role]
- `Question`: [examSourceId, sourceFile], [type, category, process]
- `ExamAssignment`: [examId, userId], [examId, process, level]
- `ExamSession`: [examId, userId], [examId, status]
- `Answer`: [sessionId, questionId] (UNIQUE)
- `AuditLog`: [createdAt], [sessionId]

---

## 3. API 設計

### 3.1 API 端點總覽 (46 個)

#### 認證模組 `/api/auth/`
| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /auth/login | 管理員登入（JWT 8hr） |
| POST | /auth/verify | 考生身份驗證（JWT 3hr） |
| POST | /auth/face | 人臉擷取 |
| POST | /auth/face-verify | 人臉比對驗證 |

#### 考試模組 `/api/exam/`
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | /exam/available | 可用考試列表 |
| GET | /exam/my-exams | 我的考試（含指派） |
| GET | /exam/my-results | 我的成績 |
| GET | /exam/[id]/questions | 取得試題 |
| POST | /exam/[id]/start | 開始考試 |
| POST | /exam/[id]/submit | 交卷 |
| POST | /exam/[id]/result | 取得成績 |
| POST | /exam/answer | 儲存答案 |
| POST | /exam/flag | 標記題目 |
| POST | /exam/[id]/audit | 審計事件 |

#### 管理端 `/api/admin/`
| 方法 | 路徑 | 說明 |
|------|------|------|
| CRUD | /admin/exams/* | 考試管理 (9 端點) |
| CRUD | /admin/questions/* | 題庫管理 (7 端點) |
| CRUD | /admin/employees/* | 員工管理 (6 端點) |
| GET | /admin/dashboard | 儀表板統計 |
| GET | /admin/reports/analytics | 報表分析 |
| POST | /admin/reports/export | 報表匯出 |
| POST | /admin/grading | 人工評分 |

### 3.2 認證機制

```
考生端:
  POST /auth/verify  →  JWT Token (3hr)  →  Cookie: token

管理端:
  POST /auth/login   →  JWT Token (8hr)  →  Cookie: admin_token

所有 API 請求:
  → getAdminFromCookie() / getUserFromCookie()
  → 驗證 JWT → 提取 userId/adminId
  → 權限不足回傳 401
```

### 3.3 關鍵 API 流程

#### 考試啟動流程
```
POST /exam/[id]/start
  ├── 驗證身份 (JWT)
  ├── 檢查 ExamAssignment 存在
  ├── 檢查考試狀態 = ACTIVE
  ├── 檢查梯次時間窗口 (ExamBatch)
  ├── 檢查應試次數限制
  ├── 依 process + level 抽題：
  │   ├── 基本題 (10%): category=BASIC, 不分工序
  │   └── 專業題 (90%): category=PROFESSIONAL, 按 process+level
  ├── 隨機排列題目與選項
  ├── 建立 ExamSession (status=IN_PROGRESS)
  ├── 建立空白 Answer 記錄
  └── 回傳 sessionId + 題目列表
```

#### 自動評分流程
```
POST /exam/[id]/submit
  ├── 驗證 session 狀態
  ├── 更新 session.status = SUBMITTED
  ├── 逐題評分:
  │   ├── SINGLE_CHOICE: 完全匹配 → 滿分
  │   ├── MULTI_CHOICE: 完全匹配 → 滿分
  │   └── TRUE_FALSE: 完全匹配 → 滿分
  ├── 計算各類別得分 (categoryScores)
  ├── 計算等級 (A/B/C/D/F)
  ├── 建立 ExamResult
  ├── 記錄 AuditLog
  └── 回傳成績摘要
```

---

## 4. 前端架構

### 4.1 頁面路由

```
考生端 /(exam)/
├── /                    → 登入頁
├── /dashboard           → 個人儀表板
├── /my-exams            → 我的考試列表
├── /instructions?...    → 考試須知
├── /verify?...          → 人臉驗證
├── /test?...            → 考試作答 (全螢幕)
├── /result?...          → 成績展示
├── /scores              → 成績查詢
└── /certificate?...     → 考核證書

管理端 /admin/
├── /                    → 儀表板
├── /login               → 管理員登入
├── /exams               → 考試列表
│   ├── /new             → 建立考試 (5步精靈)
│   └── /[id]            → 考試詳情 (Tabs)
│       ├── /results     → 成績列表
│       ├── /monitor     → 即時監控 (SSE)
│       └── /grading     → 人工評分
├── /questions           → 題庫管理
│   ├── /new             → 新增題目
│   ├── /[id]            → 編輯題目
│   └── /import          → 批次匯入
├── /employees           → 員工管理
│   ├── /[id]            → 員工詳情
│   └── /import          → 批次匯入
└── /reports             → 報表分析
```

### 4.2 狀態管理

#### Zustand Store — exam-store
```typescript
interface ExamStore {
  sessionId: string | null;
  questions: QuestionData[];
  answers: Map<string, string>;    // questionId → answerContent
  flags: Set<string>;              // questionId set
  currentIndex: number;
  timeRemaining: number;           // 剩餘秒數
  // ... actions
}
// 持久化至 localStorage，支援頁面重整恢復
```

### 4.3 自訂 Hooks

| Hook | 用途 |
|------|------|
| `useAutoSave` | 答案自動儲存（防抖 1s → API 同步 → 離線佇列） |
| `useTimer` | 倒數計時器（最後 5 分鐘紅色警示、超時自動交卷） |
| `useTabDetection` | 切屏偵測（≥3 次強制交卷） |
| `useNetworkStatus` | 網路狀態偵測（斷線/重連通知） |
| `useFaceAuth` | 人臉辨識（載入模型、擷取特徵、比對） |
| `useExamSession` | 考試主狀態管理（題目導覽、答案、標記） |

### 4.4 防作弊機制

```
┌─────────────────────────────────────────────┐
│              多層防作弊架構                   │
├─────────────────────────────────────────────┤
│ Layer 1: 動態浮水印 (ExamWatermark)          │
│   → 姓名 + 工號半透明覆蓋，嚇阻截屏          │
├─────────────────────────────────────────────┤
│ Layer 2: 切屏偵測 (useTabDetection)          │
│   → visibilitychange 事件 → 計數 → ≥3強制交卷│
├─────────────────────────────────────────────┤
│ Layer 3: 失焦模糊 (AntiCheat)               │
│   → blur 事件 → CSS blur(10px)              │
├─────────────────────────────────────────────┤
│ Layer 4: 禁止操作                            │
│   → 禁右鍵、禁選取、禁複製、禁列印           │
├─────────────────────────────────────────────┤
│ Layer 5: 審計日誌 (AuditLog)                 │
│   → 所有事件記錄（不可竄改）                  │
├─────────────────────────────────────────────┤
│ Layer 6 (可選): Android FLAG_SECURE          │
│   → 截屏/錄屏/螢幕分享全黑                   │
└─────────────────────────────────────────────┘
```

---

## 5. 核心模組設計

### 5.1 Excel 匯入引擎 (`excel.ts`)

```
Excel 檔案匯入流程:
  ├── 1. 讀取 Buffer → SheetJS 解析
  ├── 2. Sheet 類型偵測:
  │   ├── 判断题 / 判斷題 → TRUE_FALSE
  │   ├── 选择 / 選擇 → SINGLE_CHOICE
  │   ├── 简答题 / 問答題 → SHORT_ANSWER
  │   └── 未識別 → 跳過
  ├── 3. 欄位映射 (50+ 中文欄位名):
  │   ├── 试题描述/題目內容/問題 → content
  │   ├── 所属部门 → department
  │   ├── A选项/A選項 → optionA
  │   └── ... (模糊匹配容錯)
  ├── 4. AI 回退 (DeepSeek):
  │   └── 標準映射失敗 → AI 識別欄位對應
  ├── 5. 檔名解析 (parseQuestionFilename):
  │   ├── "工务部SAWⅡ级.xls" → {dept:"工务部", proc:"SAW", level:"Ⅱ级"}
  │   └── 部門後綴識別: 委员会/中心/部/处/室/科/组
  └── 6. 資料正規化 → QuestionImportRow[]
```

### 5.2 評分引擎 (`scoring.ts`)

```typescript
// 評分規則
SINGLE_CHOICE: exactMatch(answer, correctAnswer) → fullPoints | 0
MULTI_CHOICE:  exactMatch(answer, correctAnswer) → fullPoints | 0
TRUE_FALSE:    exactMatch(answer, correctAnswer) → fullPoints | 0

// 綜合成績計算
combinedScore = autoScore × theoryWeight + practicalScore × practicalWeight
isPassed = combinedScore >= compositePassScore

// 等級評定
A: ≥90  B: ≥80  C: ≥70  D: ≥60  F: <60
```

### 5.3 考試狀態機

```
DRAFT ──(發佈)──→ PUBLISHED ──(openAt到達)──→ ACTIVE ──(closeAt到達)──→ CLOSED ──(歸檔)──→ ARCHIVED
  ↑                                              │                        │
  └──────────────(重新開放,設新openAt/closeAt)─────┘                        │
                                                                          │
                                       ←──(重新開放,設新openAt/closeAt)────┘
```

### 5.4 答案三層儲存機制

```
Layer 1: Zustand Store (記憶體)
  → 即時更新 UI 狀態
  → localStorage 持久化 (頁面重整恢復)

Layer 2: 防抖 API 同步 (1 秒)
  → POST /api/exam/answer
  → 寫入 Answer 表

Layer 3: 離線佇列
  → 網路斷線時暫存
  → 重連後自動同步
```

---

## 6. 安全設計

### 6.1 認證安全
- 密碼：bcrypt 雜湊（不存明文）
- 身份證後 6 位：AES-256 加密儲存
- JWT Token：考生 3hr / 管理員 8hr 有效
- Cookie：httpOnly + secure + sameSite

### 6.2 輸入驗證
- 所有 API 請求使用 Zod Schema 驗證
- HTML 內容 `escapeHtml()` 轉義（防 XSS）
- 檔案上傳限制大小（MAX_UPLOAD_SIZE）

### 6.3 審計日誌
- 23+ 操作類型追蹤
- 記錄 IP、User-Agent、時間戳
- 不可竄改（只寫不改）

---

## 7. 效能設計

### 7.1 批次操作最佳化
- `createMany` 批次寫入（取代逐筆 create）
- 員工匹配使用 Map 結構（O(1) 查詢）
- 密碼雜湊 `Promise.all` 並行處理
- 整個匯入在單一 Transaction 中完成

### 7.2 前端效能
- 答案防抖儲存（1 秒間隔）
- Zustand 持久化避免重複 API 請求
- SSE 即時推送（取代輪詢）
- 響應式設計（桌面表格 + 手機卡片）

### 7.3 資料庫效能
- 複合索引覆蓋常用查詢
- Prisma 查詢使用 `select` 減少資料傳輸
- Transaction 隔離（防並發衝突）
- 分頁查詢（cursor / offset）

---

## 8. 部署架構

### 8.1 執行環境
- **Runtime**: Node.js
- **Port**: 12059
- **Database**: MySQL
- **File Storage**: 本地磁碟 `/public/uploads/`

### 8.2 環境變數
```
DATABASE_URL      # MySQL 連線字串
JWT_SECRET        # JWT 簽名密鑰
NEXT_PUBLIC_APP_URL  # 公開 URL
UPLOAD_DIR        # 上傳目錄
ENCRYPTION_KEY    # AES-256 加密金鑰
DEEPSEEK_API_KEY  # AI 欄位識別 API Key
```

### 8.3 定時任務
- `/api/cron/exam-status`：定期同步考試狀態（根據 openAt/closeAt 自動切換 ACTIVE ↔ CLOSED）

---

## 9. 錯誤處理策略

| 場景 | 處理方式 |
|------|---------|
| API 請求失敗 | Toast 通知 + 可重試 |
| 網路斷線 | 離線佇列暫存 + 重連自動同步 |
| 考試超時 | 自動交卷 + 強制提交所有答案 |
| 切屏超限 | 強制交卷 + 記錄審計日誌 |
| Excel 格式錯誤 | 回報錯誤行號 + AI 回退識別 |
| 題庫不足 | 共通題庫智慧補題 |
| 並發衝突 | Prisma Transaction 隔離 |
| JWT 過期 | 導回登入頁 |

---

## 10. 待優化項目

| 項目 | 優先級 | 說明 |
|------|--------|------|
| 自動化測試 | 高 | 目前無測試覆蓋，需補充單元測試與 E2E 測試 |
| 快取策略 | 中 | 題庫/考試列表可加入 Redis 快取 |
| CDN 整合 | 中 | 靜態資源與上傳檔案可透過 CDN 加速 |
| 水平擴展 | 低 | 目前單體架構，未來可拆分微服務 |
| 日誌監控 | 中 | 整合 APM 工具 (如 Sentry) |
| 資料庫備份 | 高 | 定期自動備份策略 |
