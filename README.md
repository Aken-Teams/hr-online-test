# 智考雲 - 企業員工線上考核平台

企業員工入職及技能線上測試平台，支援選擇題、判斷題、簡答題等多種題型，提供限時考試、自動評分、人工閱卷、成績統計等功能。

## 功能特色

### 考生端
- **身份驗證** — 支援密碼驗證和人臉辨識兩種方式
- **線上考試** — 選擇題 + 判斷題 + 簡答題，全程計時，到時自動交卷
- **防作弊監控** — 切屏偵測、全螢幕鎖定，異常行為即時記錄
- **即時出分** — 客觀題自動評分，交卷後立即查看成績
- **考核證書** — 考試完成後自動產生證書，支援下載 PDF

### 管理後台
- **儀表板** — 考試概覽、通過率、近期考試數據一覽
- **員工管理** — 批次匯入員工資訊（Excel）、照片上傳、人臉錄入
- **題庫管理** — 選擇題 / 判斷題 / 簡答題分類管理，支援 Excel 批次匯入
- **考試管理** — 靈活組卷、設定考試時間與評分規則、發布/關閉考試
- **閱卷評分** — 簡答題人工閱卷，支援批次操作
- **即時監控** — 考試進行中即時查看考生狀態與異常事件（SSE 推送）
- **數據報表** — 成績統計、排名分析、缺考統計、數據匯出

## 技術棧

| 類別 | 技術 |
|------|------|
| 框架 | [Next.js 16](https://nextjs.org/) (App Router) |
| 語言 | TypeScript |
| UI | React 19 + Tailwind CSS 4 |
| 圖示 | [Lucide React](https://lucide.dev/) |
| 圖表 | [Recharts](https://recharts.org/) |
| 資料庫 | MySQL + [Prisma ORM](https://www.prisma.io/) |
| 認證 | JWT ([jose](https://github.com/panva/jose)) + bcrypt |
| 人臉辨識 | [face-api.js](https://github.com/justadudewhohacks/face-api.js) |
| 狀態管理 | [Zustand](https://zustand.docs.pmnd.rs/) |
| 資料驗證 | [Zod](https://zod.dev/) |
| Excel 處理 | [SheetJS (xlsx)](https://sheetjs.com/) |

## 專案結構

```
src/
├── app/
│   ├── (exam)/              # 考生端頁面
│   │   ├── page.tsx          # 首頁（身份驗證）
│   │   ├── instructions/     # 考試須知
│   │   ├── test/             # 考試頁面
│   │   ├── result/           # 成績頁面
│   │   ├── certificate/      # 考核證書
│   │   └── verify/           # 驗證頁面（回退）
│   ├── admin/                # 管理後台頁面
│   │   ├── login/            # 管理員登入
│   │   ├── employees/        # 員工管理
│   │   ├── questions/        # 題庫管理
│   │   ├── exams/            # 考試管理
│   │   │   └── [id]/
│   │   │       ├── grading/  # 閱卷評分
│   │   │       ├── monitor/  # 即時監控
│   │   │       └── results/  # 成績查看
│   │   └── reports/          # 數據報表
│   └── api/                  # API 路由
│       ├── auth/             # 認證（登入/驗證/人臉）
│       ├── exam/             # 考試相關（答題/提交/成績）
│       ├── admin/            # 管理端 API
│       └── upload/           # 檔案上傳
├── components/
│   ├── ui/                   # 通用 UI 元件
│   ├── shared/               # 共用元件（Logo 等）
│   ├── exam/                 # 考試相關元件
│   └── admin/                # 管理端元件
├── hooks/                    # 自訂 Hooks
├── lib/                      # 工具函式
├── stores/                   # Zustand 狀態管理
└── types/                    # TypeScript 型別定義

prisma/
├── schema.prisma             # 資料庫模型定義
└── seed.ts                   # 種子資料腳本
```

## 快速開始

### 環境需求

- Node.js 18+
- MySQL 8.0+

### 安裝與設定

```bash
# 複製專案
git clone https://github.com/your-org/hr-online-test.git
cd hr-online-test

# 安裝依賴
npm install

# 設定環境變數
cp .env.example .env
# 編輯 .env 設定資料庫連線和金鑰
```

`.env` 檔案需要以下設定：

```env
DATABASE_URL="mysql://user:password@localhost:3306/hr_exam"
JWT_SECRET="your-jwt-secret-key"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="your-admin-password"
```

### 資料庫初始化

```bash
# 產生 Prisma Client
npx prisma generate

# 推送資料庫結構
npx prisma db push

# 匯入種子資料（管理員帳號 + 範例資料）
npm run seed
```

### 啟動開發伺服器

```bash
npm run dev
```

存取：
- 考生端：http://localhost:12059
- 管理後台：http://localhost:12059/admin/login

### 正式環境建置

```bash
npm run build
npm start
```

## 題庫資料

專案附帶 `試題範例/` 目錄，包含範例題庫檔案（`.xls` 格式）：

| 檔案 | 內容 | 數量 |
|------|------|------|
| 選擇題題庫.xls | 單選/多選題 | 90 題 |
| 判斷題題庫.xls | 判斷題 | 668 題 |
| 問答題題庫.xls | 簡答題 | 203 題 |

可透過管理後台的「題庫管理 → 批次匯入」功能匯入。

## License

Private - All rights reserved.

---

Powered by [智合科技](https://www.zh-aoi.com/) © 2026
