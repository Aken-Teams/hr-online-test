# 智考雲 — 系統設計文件（工程師版）

> **版本**：v1.0
> **建立時間**：2026/04/21
> **對應 PRD 版本**：v4.0

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
    DB-->>API: 員工資料+指派考試
    API-->>FE: JWT Token（exam_token）

    FE->>API: GET /api/exam/available
    API-->>FE: 考試資訊

    E->>FE: 閱讀須知 → 開始答題
    FE->>API: POST /api/exam/{id}/start
    API->>DB: 建立 ExamSession + 隨機抽題
    DB-->>API: 題目列表（questionOrder）
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
```

### 2.3 出題邏輯架構

```mermaid
flowchart TD
    START[開始抽題] --> RULES[讀取 ExamQuestionRule]
    RULES --> LOOP{遍歷每條規則}

    LOOP --> RATIO[計算 commonRatio 配比<br/>通用題數 vs 部門題數]
    RATIO --> DEPT[從該部門題庫隨機抽取<br/>部門專業題]
    DEPT --> CHECK{部門題庫足夠？}

    CHECK -->|是| COMMON[從通用題庫抽取<br/>通用基礎題]
    CHECK -->|否| FILL[以通用題庫智慧補足]
    FILL --> COMMON

    COMMON --> MERGE[合併去重]
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

    Exam ||--o{ ExamQuestionRule : "出題規則"
    Exam ||--o{ ExamQuestion : "題目"
    Exam ||--o{ ExamAssignment : "指派"
    Exam ||--o{ ExamSession : "場次"

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
        enum type "7種題型"
        text content
        string level
        string department
        string role
        int points
        string correctAnswer
        boolean isMultiSelect
        boolean isActive
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
        boolean enableFaceAuth
    }

    ExamQuestionRule {
        string id PK
        string examId FK
        enum questionType
        int count
        int pointsPerQuestion
        float commonRatio "0.0~1.0"
    }

    ExamSession {
        string id PK
        string examId FK
        string userId FK
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
| Answer | `[sessionId, questionId]` | 同一場次同一題唯一 |
| ExamResult | `sessionId` | 一場次一成績 |

### 3.3 級聯刪除策略

| 父模型 | 子模型 | onDelete |
|--------|--------|----------|
| Exam | ExamQuestionRule, ExamQuestion, ExamAssignment | Cascade |
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
| `/api/admin/questions` | GET/POST | 題目列表/建立 |
| `/api/admin/questions/[id]` | GET/PUT/DELETE | 題目詳情/更新/刪除 |
| `/api/admin/questions/import` | POST | Excel 批次匯入題目 |
| `/api/admin/employees` | GET/POST | 員工列表/建立 |
| `/api/admin/employees/[id]` | PATCH | 更新員工（人臉特徵）|
| `/api/admin/employees/import` | POST | Excel 批次匯入員工 |
| `/api/admin/grading` | GET/POST | 閱卷列表/評分 |
| `/api/admin/results/[sessionId]` | GET | 場次成績詳情 |
| `/api/admin/reports/analytics` | GET | 統計分析報表 |
| `/api/admin/reports/export` | GET | 匯出 Excel |
| `/api/admin/monitoring/sessions` | GET | SSE 即時監控 |

### 4.3 考生 API（需 exam_token）

| 路徑 | 方法 | 說明 |
|------|------|------|
| `/api/exam/available` | GET | 取得指派考試 |
| `/api/exam/[id]/start` | POST | 開始考試 |
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
        HOME[/ 首頁登入] --> VERIFY[/verify 驗證]
        VERIFY --> INST[/instructions 須知]
        INST --> TEST[/test 考試]
        TEST --> RESULT[/result 成績]
        RESULT --> CERT[/certificate 證書]
    end

    subgraph 管理端 [管理後台 /admin]
        LOGIN[/admin/login] --> DASH[/admin 儀表板]
        DASH --> EXAMS[/admin/exams 考試列表]
        EXAMS --> NEW_EXAM[/admin/exams/new 建立]
        EXAMS --> EDIT_EXAM[/admin/exams/id 編輯]
        EXAMS --> MONITOR[/admin/exams/id/monitor 監控]
        EXAMS --> RESULTS[/admin/exams/id/results 成績]
        RESULTS --> SESSION[/admin/exams/id/results/sid 詳情]
        EXAMS --> GRADING[/admin/exams/id/grading 閱卷]

        DASH --> QUESTIONS[/admin/questions 題庫]
        QUESTIONS --> NEW_Q[/admin/questions/new 新增]
        QUESTIONS --> EDIT_Q[/admin/questions/id 編輯]
        QUESTIONS --> IMPORT_Q[/admin/questions/import 匯入]

        DASH --> EMPLOYEES[/admin/employees 員工]
        EMPLOYEES --> IMPORT_E[/admin/employees/import 匯入]

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
線上理論成績 = 單選 + 多選 + 判斷（滿分 90 分）
理論合計 = 線上理論成績 + 簡答成績（線下，滿分 10 分）
綜合成績 = 理論合計 × 40% + 實操成績 × 60%
合格標準 = 綜合成績 ≥ 90 分
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
│   ├── (exam)/            # 考生端頁面
│   │   ├── page.tsx       # 首頁/登入
│   │   ├── verify/        # 身份驗證
│   │   ├── instructions/  # 考試須知
│   │   ├── test/          # 考試作答
│   │   ├── result/        # 成績查詢
│   │   └── certificate/   # 證書
│   ├── admin/             # 管理後台頁面
│   │   ├── page.tsx       # 儀表板
│   │   ├── login/         # 管理員登入
│   │   ├── exams/         # 考試管理
│   │   ├── questions/     # 題庫管理
│   │   ├── employees/     # 員工管理
│   │   └── reports/       # 報表
│   └── api/               # API 路由
│       ├── auth/          # 認證
│       ├── admin/         # 管理後台 API
│       ├── exam/          # 考生 API
│       └── upload/        # 檔案上傳
├── components/
│   ├── ui/                # 基礎 UI 元件
│   └── shared/            # 共用元件（Logo, AntiCheat, Watermark）
├── hooks/                 # 自訂 Hooks
├── stores/                # Zustand 狀態管理
├── lib/                   # 工具函式
│   ├── auth.ts            # JWT 驗證
│   ├── prisma.ts          # Prisma 實例
│   ├── scoring.ts         # 評分引擎
│   ├── question-generator.ts  # 出題引擎
│   ├── excel.ts           # Excel 解析/匯出
│   ├── validators.ts      # Zod 驗證 Schema
│   └── constants.ts       # 常數定義
└── types/                 # TypeScript 型別
    └── exam.ts
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

## 12. 本次功能調整紀錄

| 項目 | 調整內容 | 原因 |
|------|---------|------|
| 考試題型 | 建立考試時僅顯示單選/多選/判斷 | 客戶線上考試只需客觀題 |
| 閱卷功能 | UI 隱藏（代碼保留） | 客觀題全自動評分，無需閱卷 |
| 考試刪除 | 新增刪除功能（僅草稿/已發佈可刪） | 原系統缺少此功能 |
| 員工匯入 | 增加預覽確認機制 | 避免誤匯入直接寫入資料庫 |

---

**文件狀態**：v1.0 — 初版建立
