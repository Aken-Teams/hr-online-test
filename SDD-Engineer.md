# 智考雲 — 系統設計文件（工程師版）

> **版本**：v3.0
> **建立時間**：2026/04/21
> **更新時間**：2026/04/23
> **對應 PRD 版本**：v6.0

---

## 1. 系統概述

智考雲是一套企業員工線上技能考核平台，採用 Next.js 全端架構，提供題庫管理、規則式組卷、線上限時考試、全自動評分、成績統計報表、多層防作弊監控等功能。

### 技術棧

| 層級 | 技術選型 |
|------|---------|
| 前端框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| 樣式框架 | Tailwind CSS 4 + clsx + tailwind-merge |
| 狀態管理 | Zustand（含 localStorage 持久化）|
| 資料庫 | MySQL + Prisma ORM |
| 身份驗證 | JWT（jose）+ bcrypt |
| 人臉辨識 | face-api.js（前端偵測 + 特徵比對）|
| 即時推送 | Server-Sent Events（SSE）|
| 資料驗證 | Zod |
| Excel 處理 | SheetJS（xlsx）|
| 圖表 | Recharts |
| 圖示 | Lucide React |

---

## 2. 系統架構圖

### 2.1 整體架構

```mermaid
graph TB
    subgraph 客戶端
        A[考生端<br/>手機/桌面瀏覽器] -->|HTTPS| LB
        B[管理後台<br/>桌面瀏覽器] -->|HTTPS| LB
    end

    LB[Next.js Server<br/>Port 12059]

    subgraph Next.js 全端應用
        LB --> SSR[React SSR/CSR<br/>App Router]
        LB --> API[API Routes<br/>/api/*]
    end

    API --> AUTH[JWT 驗證層<br/>jose + bcrypt]
    API --> VALID[Zod 輸入驗證]
    API --> PRISMA[Prisma ORM]
    PRISMA --> DB[(MySQL)]
    API --> FS[本地檔案系統<br/>/public/uploads/]
    API --> SSE[SSE 即時推送<br/>監控場次]

    style A fill:#e0f2fe
    style B fill:#fef3c7
    style DB fill:#d1fae5
```

### 2.2 考試流程架構

```mermaid
sequenceDiagram
    participant E as 考生
    participant FE as 前端（React）
    participant API as API Routes
    participant DB as MySQL

    E->>FE: 輸入姓名+工號+身份證後6位
    FE->>API: POST /api/auth/verify
    API->>DB: 查詢員工+比對密碼
    DB-->>API: 員工資料
    API-->>FE: JWT Token（exam_token，不含 examId）

    E->>FE: 進入儀表板 → 我的考試
    FE->>API: GET /api/exam/my-exams
    API->>DB: 查詢 ExamAssignment（含 process/level）
    API-->>FE: 考試指派列表（多個工序）

    E->>FE: 選擇考試卡片 → 閱讀須知 → 開始答題
    FE->>API: POST /api/exam/{id}/start（含 assignmentId）
    API->>DB: 從 assignment 取 process+level
    API->>API: generateQuestionSet（10% 基本題 + 90% 專業題）
    API->>DB: 建立 ExamSession + 寫入 questionOrder
    API-->>FE: Session + 題目

    loop 每題作答
        E->>FE: 選擇答案
        FE->>FE: Zustand 本地儲存
        FE->>API: POST /api/exam/answer（防抖 1s）
        API->>DB: Upsert Answer
    end

    E->>FE: 手動交卷 / 時間到自動交卷
    FE->>API: POST /api/exam/{id}/submit
    API->>API: 自動評分（scoring.ts）
    API->>DB: 寫入 ExamResult
    API-->>FE: 成績結果

    E->>FE: 成績查詢
    FE->>API: GET /api/exam/my-results
    API-->>FE: 歷史成績列表（含綜合分）
```

### 2.3 出題邏輯架構

```mermaid
flowchart TD
    START[開始抽題] --> INPUT[取得 examId + process + level<br/>從 ExamAssignment]
    INPUT --> RULES[讀取 ExamQuestionRule + basicQuestionRatio]
    RULES --> LOOP{遍歷每條規則}

    LOOP --> SPLIT[計算基本題/專業題數量<br/>basicCount = count × basicQuestionRatio<br/>professionalCount = count - basicCount]

    SPLIT --> BASIC[抽取基本題<br/>category=BASIC，不分工序]
    BASIC --> PROF[抽取專業題<br/>category=PROFESSIONAL<br/>process=考生工序，level=考生級別]

    PROF --> CHECK{專業題庫足夠？}
    CHECK -->|是| MERGE[合併基本題+專業題]
    CHECK -->|否| FILL[以基本題庫智慧補足]
    FILL --> MERGE

    MERGE --> SHUFFLE[隨機排序題目+選項]
    SHUFFLE --> SAVE[寫入 questionOrder<br/>至 ExamSession]

    LOOP -->|下一條規則| LOOP
    SAVE --> END[完成抽題]
```

---

## 3. 資料庫設計

### 3.1 ER 圖

```mermaid
erDiagram
    Admin ||--o{ AuditLog : "操作紀錄"
    Admin ||--o{ Answer : "評分"

    User ||--o{ ExamSession : "應試"
    User ||--o{ ExamAssignment : "指派"

    Question ||--o{ QuestionOption : "選項"
    Question ||--o{ QuestionTag : "標籤"
    Question ||--o{ ExamQuestion : "出題"
    Question ||--o{ Answer : "作答"

    Exam ||--o{ ExamBatch : "梯次"
    Exam ||--o{ ExamQuestionRule : "出題規則"
    Exam ||--o{ ExamQuestion : "題目"
    Exam ||--o{ ExamAssignment : "指派"
    Exam ||--o{ ExamSession : "場次"
    Exam ||--o{ Question : "匯入題庫"

    ExamAssignment ||--o{ ExamSession : "場次"

    ExamSession ||--o{ Answer : "答案"
    ExamSession ||--|| ExamResult : "成績"
    ExamSession ||--o{ AuditLog : "審計"

    User {
        string id PK
        string employeeNo UK
        string name
        string idCardLast6 "bcrypt雜湊"
        string department
        string subDepartment
        string role
        string photoUrl
        json faceDescriptor "128維特徵向量"
        boolean isActive
    }

    Admin {
        string id PK
        string username UK
        string passwordHash "bcrypt"
        string displayName
        enum role "SUPER_ADMIN/HR/GRADER"
    }

    Question {
        string id PK
        enum type "SINGLE/MULTI/TRUE_FALSE"
        text content
        string level
        string department
        string role
        int points
        string correctAnswer
        boolean isMultiSelect
        boolean isActive
        string process "工序 SAW/DB/WB"
        string category "BASIC/PROFESSIONAL"
        string examSourceId FK "關聯考試"
    }

    Exam {
        string id PK
        string title
        int timeLimitMinutes
        int passScore
        int totalScore
        enum status "DRAFT~ARCHIVED"
        datetime openAt
        datetime closeAt
        datetime resultQueryOpenAt
        datetime resultQueryCloseAt
        int tabSwitchLimit
        float theoryWeight "預設0.4"
        float practicalWeight "預設0.6"
        int compositePassScore "預設90"
        float basicQuestionRatio "預設0.1"
    }

    ExamBatch {
        string id PK
        string examId FK
        string name "第一梯次"
        datetime openAt
        datetime closeAt
    }

    ExamQuestionRule {
        string id PK
        string examId FK
        enum questionType
        int count
        int pointsPerQuestion
        float commonRatio "0.0~1.0"
    }

    ExamAssignment {
        string id PK
        string examId FK
        string userId FK
        string process "報考工序"
        string level "報考級別"
    }

    ExamSession {
        string id PK
        string examId FK
        string userId FK
        string assignmentId FK "關聯指派"
        string batchId FK "梯次（可選）"
        enum status "6種狀態"
        int tabSwitchCount
        json questionOrder "題目ID陣列"
    }

    Answer {
        string id PK
        string sessionId FK
        string questionId FK
        text answerContent
        boolean isCorrect
        float earnedPoints
    }

    ExamResult {
        string id PK
        string sessionId FK "unique"
        float totalScore
        float autoScore
        float manualScore
        boolean isPassed
        string gradeLabel
        json categoryScores
        float essayScore "線下簡答"
        float practicalScore "線下實操"
        float combinedScore "綜合成績"
    }

    AuditLog {
        string id PK
        string sessionId FK
        string adminId FK
        enum action "18種操作類型"
        json details
        string ipAddress
    }
```

### 3.2 關鍵索引與約束

| 模型 | 唯一約束 | 說明 |
|------|---------|------|
| User | `employeeNo` | 工號唯一 |
| Admin | `username` | 帳號唯一 |
| ExamSession | `[examId, userId, attemptNumber]` | 同一考試同一考生同一次數唯一 |
| ExamSession | `[assignmentId, attemptNumber]` | 同一指派同一次數唯一 |
| Answer | `[sessionId, questionId]` | 同一場次同一題唯一 |
| ExamResult | `sessionId` | 一場次一成績 |

### 3.3 級聯刪除策略

| 父模型 | 子模型 | onDelete |
|--------|--------|----------|
| Exam | ExamBatch, ExamQuestionRule, ExamQuestion, ExamAssignment | Cascade |
| ExamSession | Answer, ExamResult | Cascade |
| ExamSession | AuditLog | 手動刪除（無 Cascade）|
| Exam | ExamSession | 手動刪除（API 層處理）|

---

## 4. API 設計

### 4.1 認證 API

| 路徑 | 方法 | 說明 | 驗證 |
|------|------|------|------|
| `/api/auth/login` | POST | 管理員登入 | 無 |
| `/api/auth/verify` | POST | 考生密碼驗證 | 無 |
| `/api/auth/face-verify` | POST | 考生人臉驗證 | 無 |
| `/api/auth/face` | POST | 取得人臉比對基準 | 無 |

### 4.2 管理後台 API（需 admin_token）

| 路徑 | 方法 | 說明 |
|------|------|------|
| `/api/admin/dashboard` | GET | 儀表板統計 |
| `/api/admin/exams` | GET/POST | 考試列表/建立 |
| `/api/admin/exams/[id]` | GET/PUT/DELETE | 考試詳情/更新/刪除 |
| `/api/admin/exams/[id]/publish` | POST | 發佈考試 |
| `/api/admin/exams/[id]/status` | PATCH | 手動狀態轉換 |
| `/api/admin/exams/[id]/sessions` | GET/DELETE | 場次列表/清除 |
| `/api/admin/exams/[id]/offline-scores` | GET/POST | 離線成績範本/匯入 |
| `/api/admin/exams/[id]/participants` | GET/POST | 應考人員列表/匯入 |
| `/api/admin/exams/[id]/import-questions` | POST | 匯入題庫（綁定考試） |
| `/api/admin/questions` | GET/POST | 題目列表/建立（支援 examSourceId/process/category 篩選） |
| `/api/admin/questions/[id]` | GET/PUT/DELETE | 題目詳情/更新/刪除 |
| `/api/admin/questions/import` | POST | Excel 批次匯入題目 |
| `/api/admin/employees` | GET/POST | 員工列表/建立 |
| `/api/admin/employees/[id]` | GET/PATCH | 員工詳情（含指派+歷史成績）/更新 |
| `/api/admin/employees/import` | POST | Excel 批次匯入員工 |
| `/api/admin/grading` | GET/POST | 閱卷列表/評分 |
| `/api/admin/results/[sessionId]` | GET | 場次成績詳情 |
| `/api/admin/reports/analytics` | GET | 統計分析報表 |
| `/api/admin/reports/export` | GET | 匯出 Excel |
| `/api/admin/monitoring/sessions` | GET | SSE 即時監控 |

### 4.3 考生 API（需 exam_token）

| 路徑 | 方法 | 說明 |
|------|------|------|
| `/api/exam/available` | GET | 取得指派考試（向後相容） |
| `/api/exam/my-exams` | GET | 我的考試列表（含工序/級別/狀態） |
| `/api/exam/my-results` | GET | 我的歷史成績列表 |
| `/api/exam/[id]/start` | POST | 開始考試（含 assignmentId） |
| `/api/exam/[id]/questions` | GET | 載入題目 |
| `/api/exam/answer` | POST | 儲存答案（Upsert）|
| `/api/exam/[id]/submit` | POST | 交卷+自動評分 |
| `/api/exam/[id]/result` | GET | 查詢成績 |
| `/api/exam/flag` | POST | 標記/取消標記題目 |
| `/api/exam/[id]/audit` | POST | 上報審計事件 |

### 4.4 檔案上傳 API

| 路徑 | 方法 | 說明 | 限制 |
|------|------|------|------|
| `/api/upload/photo` | POST | 員工照片 | 10MB, JPG/PNG/WebP |
| `/api/upload/question-image` | POST | 題目圖片 | 5MB |

---

## 5. 前端頁面結構

### 5.1 路由地圖

```mermaid
graph LR
    subgraph 考生端 ["考生端 /(exam)"]
        HOME[/ 首頁登入] --> DASHBOARD[/dashboard 儀表板]
        DASHBOARD --> MY_EXAMS[/my-exams 我的考試]
        DASHBOARD --> SCORES[/scores 成績查詢]
        MY_EXAMS --> INST[/instructions 須知]
        INST --> TEST[/test 考試]
        TEST --> RESULT[/result 成績]
    end

    subgraph 管理端 [管理後台 /admin]
        LOGIN[/admin/login] --> DASH[/admin 儀表板]
        DASH --> EXAMS[/admin/exams 考試列表]
        EXAMS --> NEW_EXAM[/admin/exams/new 建立精靈]
        EXAMS --> EDIT_EXAM[/admin/exams/id 詳情Tabs]
        EXAMS --> MONITOR[/admin/exams/id/monitor 監控]
        EXAMS --> RESULTS[/admin/exams/id/results 成績]
        RESULTS --> SESSION[/admin/exams/id/results/sid 詳情]

        DASH --> QUESTIONS[/admin/questions 題庫]
        QUESTIONS --> NEW_Q[/admin/questions/new 新增]
        QUESTIONS --> EDIT_Q[/admin/questions/id 編輯]
        QUESTIONS --> IMPORT_Q[/admin/questions/import 匯入]

        DASH --> EMPLOYEES[/admin/employees 員工]
        EMPLOYEES --> EMP_DETAIL[/admin/employees/id 詳情]

        DASH --> REPORTS[/admin/reports 報表]
    end

    style HOME fill:#e0f2fe
    style DASH fill:#fef3c7
```

### 5.2 狀態管理

| Store | 檔案 | 職責 |
|-------|------|------|
| `exam-store` | `src/stores/exam-store.ts` | 考試作答狀態（答案、標記、進度）|
| `admin-store` | `src/stores/admin-store.ts` | 管理後台狀態（篩選、分頁）|

### 5.3 自訂 Hooks

| Hook | 職責 |
|------|------|
| `useTimer` | 倒數計時器（考試計時）|
| `useAutoSave` | 答案防抖自動儲存（1s）|
| `useExamSession` | 考試場次狀態管理 |
| `useFaceAuth` | 人臉辨識流程 |
| `useNetworkStatus` | 網路狀態偵測 |
| `useTabDetection` | 切屏偵測（防作弊）|

---

## 6. 防作弊機制

```mermaid
flowchart LR
    subgraph 前端防護
        W[動態浮水印<br/>ExamWatermark<br/>姓名+工號]
        B[失焦模糊<br/>AntiCheat<br/>blur 10px]
        T[切屏偵測<br/>useTabDetection<br/>≥3次強制交卷]
        N[網路偵測<br/>useNetworkStatus]
        P[禁止操作<br/>右鍵/複製/列印]
    end

    subgraph 後端記錄
        A[AuditLog<br/>審計日誌]
        M[SSE 即時監控<br/>管理員即時查看]
    end

    T -->|上報事件| A
    N -->|上報事件| A
    A --> M
```

---

## 7. 評分引擎

### 7.1 自動評分邏輯（scoring.ts）

| 題型 | 評分規則 |
|------|---------|
| 單選題 | 答案完全匹配 → 滿分，否則 0 分 |
| 多選題 | 答案完全匹配 → 滿分，否則 0 分 |
| 判斷題 | 答案完全匹配 → 滿分，否則 0 分 |

### 7.2 綜合成績計算

```
線上理論成績 = 單選 + 多選 + 判斷（自動評分）
綜合成績 = 線上理論分 × theoryWeight + 實操分 × practicalWeight
合格標準 = 綜合成績 ≥ compositePassScore

預設值：theoryWeight=0.4, practicalWeight=0.6, compositePassScore=90
所有權重與合格分可在建立考試時自訂。
```

---

## 8. 考試狀態機

```mermaid
stateDiagram-v2
    [*] --> DRAFT: 建立考試
    DRAFT --> PUBLISHED: 發佈（驗證規則+指派）
    PUBLISHED --> ACTIVE: 開放考試
    ACTIVE --> CLOSED: 結束考試
    CLOSED --> ACTIVE: 重新開放
    CLOSED --> ARCHIVED: 歸檔
    DRAFT --> [*]: 刪除
    PUBLISHED --> [*]: 刪除
```

**刪除規則**：僅 `DRAFT` 和 `PUBLISHED` 狀態可刪除，進行中/已結束/已歸檔不可刪除。

---

## 9. 安全設計

| 機制 | 實作方式 |
|------|---------|
| 密碼儲存 | bcrypt 雜湊（不存明文）|
| 身份驗證 | JWT httpOnly Cookie（考生 3hr / 管理員 8hr）|
| 輸入驗證 | Zod Schema 驗證所有 API 請求 |
| XSS 防護 | React 自動轉義 + escapeHtml |
| CSRF 防護 | httpOnly Cookie + SameSite |
| 檔案上傳 | 檔案大小限制 + MIME 類型驗證 |
| 審計追蹤 | AuditLog 記錄 18 種操作類型 |

---

## 10. 檔案結構

```
src/
├── app/
│   ├── (exam)/            # 考生端頁面（含側邊欄導覽）
│   │   ├── layout.tsx     # 考生端 Layout（登入後顯示側邊欄）
│   │   ├── page.tsx       # 首頁/登入
│   │   ├── dashboard/     # 儀表板（歡迎+快捷入口）
│   │   ├── my-exams/      # 我的考試（篩選+分頁卡片列表）
│   │   ├── scores/        # 成績查詢（歷史成績彙總）
│   │   ├── verify/        # 身份驗證（全螢幕，無側邊欄）
│   │   ├── instructions/  # 考試須知（接受 assignmentId）
│   │   ├── test/          # 考試作答（全螢幕，無側邊欄）
│   │   ├── result/        # 交卷結果
│   │   └── certificate/   # 證書
│   ├── admin/             # 管理後台頁面
│   │   ├── page.tsx       # 儀表板
│   │   ├── login/         # 管理員登入
│   │   ├── exams/         # 考試管理
│   │   │   ├── new/       # 建立精靈（5 步驟）
│   │   │   │   └── steps/ # Step1~Step5 子元件
│   │   │   └── [id]/      # 考試詳情（Tabs 介面）
│   │   │       └── tabs/  # TabBasicInfo, TabParticipants, TabScores
│   │   ├── questions/     # 題庫管理（含關聯考試篩選）
│   │   ├── employees/     # 員工管理
│   │   │   └── [id]/      # 員工詳情（基本信息+指派+成績）
│   │   └── reports/       # 報表
│   └── api/               # API 路由
│       ├── auth/          # 認證（verify 不再帶 examId）
│       ├── admin/         # 管理後台 API
│       │   ├── exams/[id]/participants/   # 應考人員管理
│       │   └── exams/[id]/import-questions/  # 考試綁定題庫匯入
│       ├── exam/          # 考生 API
│       │   ├── my-exams/  # 我的考試列表
│       │   └── my-results/  # 我的歷史成績
│       └── upload/        # 檔案上傳
├── components/
│   ├── ui/                # 基礎 UI 元件（含 Stepper, Tabs）
│   └── shared/            # 共用元件
├── hooks/                 # 自訂 Hooks
├── stores/                # Zustand 狀態管理
├── lib/                   # 工具函式
│   ├── auth.ts            # JWT 驗證
│   ├── prisma.ts          # Prisma 實例
│   ├── scoring.ts         # 評分引擎
│   ├── question-generator.ts  # 出題引擎（基本題+專業題雙軌）
│   ├── exam-batch.ts      # 梯次時間窗口判斷（isInExamTimeWindow）
│   ├── excel.ts           # Excel 解析/匯出（含應考名單解析）
│   ├── deepseek.ts        # AI 智能欄位識別（DeepSeek API）
│   ├── validators.ts      # Zod 驗證 Schema
│   └── constants.ts       # 常數定義（含工序/分類常數）
└── types/                 # TypeScript 型別
    └── exam.ts            # 含 MyExamItem, MyResultItem 等
```

---

## 11. 環境設定

```env
DATABASE_URL="mysql://user:password@host:port/hr_online"
JWT_SECRET="change-this-to-a-random-secret"
NEXT_PUBLIC_APP_URL="http://localhost:12059"
UPLOAD_DIR="./public/uploads"
```

---

## 12. 功能調整紀錄

### v1.0（2026/04/21）

| 項目 | 調整內容 | 原因 |
|------|---------|------|
| 考試題型 | 建立考試時僅顯示單選/多選/判斷 | 客戶線上考試只需客觀題 |
| 閱卷功能 | UI 隱藏（代碼保留） | 客觀題全自動評分，無需閱卷 |
| 考試刪除 | 新增刪除功能（僅草稿/已發佈可刪） | 原系統缺少此功能 |
| 員工匯入 | 增加預覽確認機制 | 避免誤匯入直接寫入資料庫 |

### v2.0（2026/04/22）— 多工序考試架構重構

| 項目 | 調整內容 | 原因 |
|------|---------|------|
| 多工序指派 | ExamAssignment 新增 process/level，同一考生可考多個工序 | 客戶需求：一場考試中員工考多個工序 |
| 題目分類 | Question 新增 process、category（BASIC/PROFESSIONAL）、examSourceId | 區分基本題與專業題，按工序+級別出題 |
| 出題邏輯 | 改為 10% 基本題 + 90% 專業題雙軌抽題 | 基本題不分工序，專業題按工序+級別 |
| 考試權重 | Exam 新增 theoryWeight/practicalWeight/compositePassScore/basicQuestionRatio | 權重與合格分可調，不再寫死 |
| 前台架構 | 登入→儀表板→我的考試/成績查詢（三頁面+側邊欄） | 原本登入直接進考試，改為多考試選擇 |
| JWT 簡化 | auth/verify 不再帶 examId，登入只驗身份 | 登入不綁定單一考試 |
| 考試建立 | 改為 5 步驟精靈（基本信息→規則→題庫→人員→確認） | 多步驟流程更清晰 |
| 考試詳情 | 改為 Tabs 介面（基本信息/應考人員/成績） | 資訊分類展示更清楚 |
| 員工詳情 | 新增員工詳情頁（基本信息/考試指派/歷史成績） | 管理者需查看員工考試歷程 |
| 人臉功能 | UI 隱藏（代碼保留備用） | 暫不需要人臉辨識功能 |
| 題庫篩選 | 新增關聯考試、工序、分類篩選 | 以考試為中心管理題庫 |
| 成績顯示 | 成績未開放時所有分數統一隱藏 | 用戶要求全部隱藏，不先顯示線上分 |

### v3.0（2026/04/23）— 考試梯次 + 篩選分頁 + 匯入優化

| 項目 | 調整內容 | 原因 |
|------|---------|------|
| ExamBatch 模型 | 新增 ExamBatch（id, examId, name, openAt, closeAt），Exam 加 batches relation | 支援考試分時段管理（梯次） |
| ExamSession.batchId | ExamSession 新增可選 batchId 欄位 | 追蹤考生在哪個梯次參加考試 |
| exam-batch.ts | 新增 `isInExamTimeWindow()` 工具函式 | 梯次感知的時間窗口判斷，向後相容無梯次考試 |
| 梯次時間驗證 | 建立/編輯考試時驗證梯次時間在考試範圍內 | 防止設定無效的梯次時間 |
| 我的考試頁面 | 改為 4 組 CustomSelect 篩選 + 分頁（9/頁），預設顯示活躍考試 | 多考試場景下的瀏覽體驗優化 |
| 考試列表篩選 | 管理後台考試列表新增狀態/標題篩選 | 快速定位考試 |
| 批次匯入優化 | 題庫匯入、人員匯入均改用 `createMany` 批次寫入 | 大幅提升匯入效能（數千筆資料秒級完成） |
| 人員匹配優化 | 預先載入所有使用者至 Map，O(1) 查詢匹配 | 取代逐筆查詢資料庫 |
| 並行雜湊 | 驗證碼 bcrypt 雜湊改用 `Promise.all` 並行處理 | 減少密碼雜湊等待時間 |
| AI 欄位識別 | 新增 deepseek.ts，Excel 匯入失敗時自動呼叫 AI 識別欄位 | 相容各種格式的 Excel 檔案 |
| 已封存考試 | my-exams、my-results API 包含 ARCHIVED 狀態 | 考生可查看歷史考試 |
| correctAnswer | Question.correctAnswer 改為 @db.Text | 支援長文字正確答案 |

---

**文件狀態**：v3.0 — 考試梯次 + 篩選分頁 + 匯入優化
