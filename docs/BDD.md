# 智考雲 — 行為驅動開發文件 (BDD - Behavior-Driven Development)

**文件版本**：v1.0
**建立時間**：2026/05/05
**專案名稱**：智考雲 — 企業員工線上考核平台

---

## 1. 文件說明

本文件使用 Gherkin 語法 (Given-When-Then) 定義智考雲平台的行為規格。每個 Feature 對應一個功能模組，每個 Scenario 描述一個具體使用者行為及其預期結果。

---

## 2. 身份驗證 (Authentication)

### Feature: 考生身份驗證

```gherkin
Feature: 考生身份驗證
  身為考生
  我希望透過密碼快速完成身份驗證
  以便進入考試系統

  Background:
    Given 系統已有員工資料
      | employeeNo | name | department | idCardLast6 |
      | T001       | 張三 | 工務部     | 123456      |
    And 該員工已被指派考試 "2026年4月技能考核"

  Scenario: 成功登入
    Given 我在登入頁面
    When 我輸入姓名 "張三"
    And 我輸入工號 "T001"
    And 我選擇部門 "工務部"
    And 我輸入密碼 "123456"
    And 我點擊「登入」按鈕
    Then 系統應簽發 JWT Token（有效期 3 小時）
    And 我應被導向至個人儀表板
    And 儀表板應顯示 "歡迎，張三"

  Scenario: 密碼錯誤
    Given 我在登入頁面
    When 我輸入正確的姓名和工號
    And 我輸入錯誤的密碼 "000000"
    And 我點擊「登入」按鈕
    Then 系統應顯示錯誤訊息 "身份验证失败"
    And 不應簽發任何 Token

  Scenario: 工號不存在
    Given 我在登入頁面
    When 我輸入不存在的工號 "X999"
    And 我點擊「登入」按鈕
    Then 系統應顯示錯誤訊息 "身份验证失败"

  Scenario: Token 過期
    Given 我已登入超過 3 小時
    When 我嘗試訪問「我的考試」頁面
    Then 系統應將我導向登入頁面
```

### Feature: 管理員登入

```gherkin
Feature: 管理員登入
  身為 HR 管理員
  我希望透過帳號密碼登入後台
  以便管理題庫、考試與員工

  Scenario: 管理員成功登入
    Given 系統已有管理員帳號 "admin"
    And 我在管理員登入頁面
    When 我輸入帳號 "admin" 和正確密碼
    And 我點擊「登入」
    Then 系統應簽發 JWT Token（有效期 8 小時）
    And 我應被導向至管理儀表板
    And 儀表板應顯示系統概況數據
```

---

## 3. 題庫管理 (Question Bank)

### Feature: 題庫批次匯入

```gherkin
Feature: 題庫批次匯入
  身為 HR 管理員
  我希望從 Excel 檔案批次匯入題目到指定考試
  以便快速建置題庫

  Background:
    Given 我已登入管理後台
    And 系統已有考試 "強茂徐州考試測驗 - Demo"

  Scenario: 匯入專業題目（從檔名解析元資料）
    Given 我在「導入題庫」頁面
    And 我已選擇關聯考試 "強茂徐州考試測驗 - Demo"
    When 我上傳檔案 "工务部SAWⅡ级.xls"
    And 我在分類對話框中選擇「專業知識」
    And 我點擊「導入全部」
    Then 系統應從檔名解析出:
      | 部門   | 工序 | 級別 |
      | 工务部 | SAW  | Ⅱ级  |
    And 題目的 category 應為 "PROFESSIONAL"
    And 題目的 examSourceId 應關聯至該考試
    And 題目的 level 應保留 Excel 中的級別資料
    And 頁面應顯示匯入結果（解析數、建立數）

  Scenario: 匯入基本題目（級別強制清空）
    Given 我在「導入題庫」頁面
    When 我上傳檔案 "半导体封装基础知识.xls"
    And 我在分類對話框中選擇「基本知識」
    And 我點擊「導入全部」
    Then 題目的 category 應為 "BASIC"
    And 題目的 level 應為空字串（無論 Excel 中是否有值）

  Scenario: 重複匯入同一檔案（覆蓋模式）
    Given 考試已有來自 "工务部SAWⅡ级.xls" 的 50 道題目
    When 我重新上傳修改後的 "工务部SAWⅡ级.xls"（含 55 道題目）
    And 我點擊「導入全部」
    Then 系統應先刪除原有的 50 道題目
    And 再建立新的 55 道題目
    And 頁面應顯示 "55 題導入，50 題已覆蓋"

  Scenario: 未選擇考試時無法上傳
    Given 我在「導入題庫」頁面
    And 我尚未選擇關聯考試
    When 我嘗試上傳檔案
    Then 系統應顯示提示 "请先选择关联考试"
    And 上傳區域應呈現禁用狀態

  Scenario: AI 回退識別非標準欄位
    Given Excel 使用非標準欄位名稱（如「題幹」取代「試題描述」）
    When 標準欄位映射解析 0 筆
    Then 系統應自動呼叫 AI 識別欄位對應關係
    And 使用 AI 映射結果重新解析
    And 成功匯入題目
```

### Feature: 題庫 CRUD

```gherkin
Feature: 題庫 CRUD 管理
  身為 HR 管理員
  我希望新增、編輯、刪除和篩選題目
  以便維護題庫內容的正確性

  Scenario: 新增單選題
    Given 我在「新建題目」頁面
    When 我選擇題型 "單選題"
    And 我填寫題目內容 "以下哪個工具常用於根本原因分析"
    And 我填寫選項:
      | 標籤 | 內容           |
      | A    | 魚骨圖         |
      | B    | 甘特圖         |
      | C    | 流程圖         |
      | D    | 帕累托圖       |
    And 我選擇正確答案 "A"
    And 我點擊「儲存」
    Then 題目應成功建立
    And 4 個選項應正確儲存

  Scenario: 多條件篩選題目
    Given 題庫有來自不同部門、工序、分類的題目
    When 我選擇篩選條件:
      | 關聯考試 | 題型   | 分類     | 部門   | 工序 |
      | Demo考試 | 單選題 | 專業知識 | 工務部 | SAW  |
    Then 列表應只顯示符合所有條件的題目

  Scenario: 批量刪除題目
    Given 我勾選了 5 道題目
    When 我點擊「批量刪除」
    And 我確認刪除操作
    Then 5 道題目及其選項應被刪除
```

---

## 4. 考試管理 (Exam Management)

### Feature: 建立考試

```gherkin
Feature: 建立考試（5步精靈）
  身為 HR 管理員
  我希望透過多步驟精靈建立考試
  以便完整配置出題規則、題庫和應考人員

  Scenario: 完整建立一場考試
    Given 我在「建立考試」頁面
    # Step 1: 基本信息
    When 我填寫考試標題 "2026年4月技能考核"
    And 我設定時限 60 分鐘
    And 我設定理論權重 40%、實操權重 60%
    And 我設定合格分 90 分
    And 我設定基本題比例 10%
    And 我設定開放時間 "2026-04-20 09:00" 和關閉時間 "2026-04-20 18:00"
    And 我新增梯次:
      | 名稱     | 開始時間          | 結束時間          |
      | 第一梯次 | 2026-04-20 09:00 | 2026-04-20 12:00 |
      | 第二梯次 | 2026-04-20 14:00 | 2026-04-20 17:00 |
    And 我進入下一步
    # Step 2: 出題規則
    And 我設定出題規則:
      | 題型   | 數量 | 分值 |
      | 單選題 | 20   | 2    |
      | 多選題 | 10   | 3    |
      | 判斷題 | 20   | 1    |
    Then 系統應顯示總分 90 分
    # Step 3-5: 匯入題庫 → 匯入人員 → 確認
    When 我完成題庫匯入和人員匯入
    And 我在摘要頁面點擊「建立考試」
    Then 考試應建立成功，狀態為 DRAFT
    And 頁面應導向考試詳情頁
```

### Feature: 考試狀態管理

```gherkin
Feature: 考試狀態管理
  身為 HR 管理員
  我希望控制考試的生命週期
  以便按時開放和關閉考試

  Scenario: 發佈考試
    Given 考試 "2026年4月技能考核" 狀態為 DRAFT
    When 我點擊「發佈」按鈕
    Then 考試狀態應變為 PUBLISHED

  Scenario: 考試自動開放
    Given 考試狀態為 PUBLISHED
    And openAt 時間已到達
    When 系統執行狀態同步
    Then 考試狀態應自動變為 ACTIVE

  Scenario: 考試自動關閉
    Given 考試狀態為 ACTIVE
    And closeAt 時間已到達
    When 系統執行狀態同步
    Then 考試狀態應自動變為 CLOSED

  Scenario: 重新開放已關閉的考試
    Given 考試狀態為 CLOSED
    When 我點擊「重新開放」
    And 我設定新的開放時間 "2026-05-01 09:00"
    And 我設定新的關閉時間 "2026-05-01 18:00"
    And 我點擊確認
    Then 考試狀態應變為 ACTIVE
    And openAt 應更新為 "2026-05-01 09:00"
    And closeAt 應更新為 "2026-05-01 18:00"
```

### Feature: 梯次管理

```gherkin
Feature: 考試梯次管理
  身為 HR 管理員
  我希望管理考試梯次的時間設定
  以便分批安排考生應試

  Scenario: 修改未開始的梯次
    Given 考試狀態為 ACTIVE
    And 第五梯次尚未開始
    When 我修改第五梯次的開始時間
    Then 修改應成功儲存

  Scenario: 無法修改已開始的梯次
    Given 考試狀態為 ACTIVE
    And 第一梯次已開始
    When 我嘗試修改第一梯次的時間
    Then 時間欄位應為鎖定狀態，無法編輯

  Scenario: 新增梯次
    Given 考試狀態為 ACTIVE
    When 我新增一個新梯次
    And 設定時間在考試關閉時間之前
    Then 新梯次應成功建立
```

---

## 5. 線上考試 (Online Exam)

### Feature: 考試作答流程

```gherkin
Feature: 線上考試作答
  身為考生
  我希望在手機上順暢完成考試
  以便取得技能等級認定

  Background:
    Given 我已登入系統
    And 我被指派了考試 "2026年4月技能考核"，工序 "SAW"，級別 "Ⅱ级"
    And 考試狀態為 ACTIVE
    And 當前時間在某個梯次窗口內

  Scenario: 開始考試並自動組卷
    Given 我在「我的考試」頁面
    When 我點擊考試卡片
    And 我閱讀考試須知後點擊「開始答題」
    Then 系統應根據我的工序和級別自動抽題
    And 10% 的題目應來自基本題庫（不分工序）
    And 90% 的題目應來自 SAW + Ⅱ级 的專業題庫
    And 題目和選項應隨機排列
    And 頁面應顯示 60 分鐘倒數計時器
    And 頁面應顯示動態浮水印（我的姓名+工號）

  Scenario: 答題並自動儲存
    Given 我正在考試中
    When 我選擇第 1 題的答案 "A"
    Then 答案應在 1 秒內自動儲存至伺服器
    And 答題導覽列中第 1 題應標示為「已答」（綠色）

  Scenario: 標記不確定的題目
    Given 我正在考試中
    When 我對第 5 題點擊「標記」按鈕
    Then 答題導覽列中第 5 題應標示為「已標記」（黃色）
    And 我稍後可透過導覽列快速跳轉至該題

  Scenario: 斷線後恢復作答
    Given 我正在考試中且已答 10 題
    When 網路斷線
    And 我繼續作答 2 題
    And 網路恢復連線
    Then 斷線期間的 2 題答案應自動同步至伺服器
    And 不應遺失任何答案

  Scenario: 重新整理頁面後恢復
    Given 我正在考試中且已答 15 題
    When 我按下 F5 重新整理頁面
    Then 系統應從 localStorage 恢復考試狀態
    And 15 題的答案應完整保留
    And 倒數計時應繼續（不重置）

  Scenario: 手動交卷
    Given 我已答完所有題目
    When 我點擊「交卷」按鈕
    Then 系統應顯示二次確認對話框
    When 我點擊「確定交卷」
    Then 系統應自動評分所有題目
    And 即時顯示我的成績

  Scenario: 超時自動交卷
    Given 我正在考試中
    When 倒數計時歸零
    Then 系統應自動提交所有已儲存的答案
    And 自動評分並顯示成績

  Scenario: 倒數計時最後 5 分鐘警示
    Given 我正在考試中
    When 剩餘時間不足 5 分鐘
    Then 計時器應以紅色顯示
    And 應有視覺提醒
```

### Feature: 考試篩選

```gherkin
Feature: 我的考試篩選與分頁
  身為考生
  我希望透過篩選快速找到要參加的考試
  以便節省時間

  Background:
    Given 我已登入系統
    And 我被指派了多場考試、多個工序

  Scenario: 使用篩選器定位考試
    Given 我在「我的考試」頁面
    When 我選擇考試名稱 "2026年4月技能考核"
    And 我選擇工序 "SAW"
    And 我選擇級別 "Ⅱ级"
    And 我選擇狀態 "進行中"
    Then 列表應只顯示符合條件的考試卡片

  Scenario: 分頁瀏覽
    Given 我有超過 9 張考試卡片
    When 我瀏覽「我的考試」頁面
    Then 每頁應顯示最多 9 張卡片
    And 應有分頁導覽按鈕
```

---

## 6. 防作弊 (Anti-Cheating)

### Feature: 多層防作弊機制

```gherkin
Feature: 考試防作弊
  身為系統
  我需要防範考生作弊行為
  以確保考試公平性

  Background:
    Given 考生正在考試中

  Scenario: 切屏偵測與強制交卷
    When 考生切換至其他視窗或分頁（第 1 次）
    Then 系統應記錄切屏事件至審計日誌
    And 切屏計數器增加至 1
    When 考生再次切屏（第 2 次）
    Then 切屏計數器增加至 2
    When 考生第 3 次切屏
    Then 系統應強制交卷
    And 記錄 "切屏超限強制交卷" 至審計日誌

  Scenario: 頁面失焦時模糊化
    When 考試頁面失去焦點
    Then 頁面內容應立即模糊化 (blur 10px)
    When 考生返回考試頁面
    Then 頁面應恢復清晰

  Scenario: 動態浮水印顯示
    When 考試頁面載入
    Then 應全螢幕覆蓋半透明浮水印
    And 浮水印內容為考生姓名和工號
    And 截屏時浮水印應可見（可追溯身份）

  Scenario: 禁止右鍵與複製
    When 考生在考試頁面右鍵點擊
    Then 不應顯示右鍵選單
    When 考生嘗試選取文字
    Then 文字不應被選取
    When 考生按下 Ctrl+C
    Then 不應複製任何內容
```

### Feature: 即時監控

```gherkin
Feature: 管理員即時監控
  身為 HR 管理員
  我希望即時監控考生的作答狀態
  以便掌握考試進度和異常行為

  Background:
    Given 考試正在進行中
    And 我在監控頁面

  Scenario: 即時更新考生狀態
    When 有考生開始考試
    Then 監控頁面應在 3 秒內顯示該考生狀態為「進行中」
    And 顯示考生姓名、部門、開始時間

  Scenario: 偵測異常行為
    When 某考生切屏次數達到 2 次
    Then 該考生的列應以黃色警示標記
    When 切屏次數達到 3 次（觸發強制交卷）
    Then 該考生的列應以紅色標記
    And 狀態應更新為「異常交卷」

  Scenario: 查看缺考名單
    When 梯次時間結束
    Then 我應能查看未開考的考生名單
```

---

## 7. 評分與成績 (Scoring & Results)

### Feature: 自動評分

```gherkin
Feature: 全自動評分
  身為系統
  我需要在考生交卷後即時自動評分
  以便即時出分

  Scenario: 單選題評分
    Given 題目正確答案為 "A"
    When 考生作答 "A"
    Then 該題得分應為滿分
    When 考生作答 "B"
    Then 該題得分應為 0 分

  Scenario: 多選題評分
    Given 題目正確答案為 "A,C"
    When 考生作答 "A,C"
    Then 該題得分應為滿分
    When 考生作答 "A"
    Then 該題得分應為 0 分
    When 考生作答 "A,B,C"
    Then 該題得分應為 0 分

  Scenario: 判斷題評分
    Given 題目正確答案為 "TRUE"
    When 考生作答 "TRUE"
    Then 該題得分應為滿分
    When 考生作答 "FALSE"
    Then 該題得分應為 0 分

  Scenario: 綜合成績計算
    Given 理論權重 40%、實操權重 60%、合格分 90 分
    And 考生線上考試得分 85 分
    And 實操考核得分 95 分
    When 系統計算綜合成績
    Then 綜合成績應為 85 × 0.4 + 95 × 0.6 = 91 分
    And 結果應為「合格」

  Scenario: 等級評定
    Given 考生得分 92 分
    Then 等級應為 "A"
    Given 考生得分 85 分
    Then 等級應為 "B"
    Given 考生得分 72 分
    Then 等級應為 "C"
    Given 考生得分 65 分
    Then 等級應為 "D"
    Given 考生得分 55 分
    Then 等級應為 "F"
```

### Feature: 成績查詢控制

```gherkin
Feature: 成績查詢時間窗口
  身為 HR 管理員
  我希望控制考生查詢成績的時間
  以便在適當時機開放成績

  Scenario: 管理員開放成績查詢
    Given 考試已結束
    When 我設定成績查詢開放時間為「今天」到「7天後」
    Then 考生在開放期間內應能查看:
      | 線上分 | 實操分 | 綜合分 | 錯題解析 |

  Scenario: 考生在未開放期間查詢
    Given 管理員尚未開放成績查詢
    When 考生進入「成績查詢」頁面
    Then 所有分數應為隱藏狀態
    And 顯示提示 "成績尚未開放查詢"

  Scenario: 開放期滿自動關閉
    Given 成績查詢開放期已過（超過 resultQueryCloseAt）
    When 考生嘗試查詢成績
    Then 成績應再次隱藏
    And API 不應回傳詳細解析資料
```

---

## 8. 員工管理 (Employee Management)

### Feature: 員工資料管理

```gherkin
Feature: 員工資料管理
  身為 HR 管理員
  我希望管理員工資料和考試指派
  以便維護考核對象的正確性

  Scenario: 批次匯入員工
    Given 我準備了員工名單 Excel
      | 工號 | 姓名 | 部門   | 崗位   | 身份證後6位 |
      | T001 | 張三 | 工務部 | 技術員 | 123456      |
      | T002 | 李四 | 生產部 | 操作員 | 654321      |
    When 我上傳該 Excel 檔案
    Then 系統應建立 2 位員工
    And 身份證後 6 位應以 AES-256 加密儲存
    And 驗證碼應以 bcrypt 雜湊儲存

  Scenario: 查看員工詳情
    Given 系統有員工 "張三"
    When 我在員工列表點擊 "張三"
    Then 應顯示基本信息:
      | 姓名 | 工號 | 部門   | 崗位   | 狀態 |
      | 張三 | T001 | 工務部 | 技術員 | 在職 |
    And 應顯示考試指派記錄（考試名稱、工序、級別）
    And 應顯示歷史成績（線上分、實操分、綜合分、是否合格）

  Scenario: 編輯考試指派的工序和級別
    Given 我在員工詳情頁
    And 該員工有一筆考試指派（工序=SAW，級別=Ⅰ级）
    When 我點擊該指派記錄的「編輯」按鈕
    Then 應彈出編輯對話框
    And 工序欄位應為下拉選單（列出該考試所有現有工序值）
    And 級別欄位應為下拉選單（列出該考試所有現有級別值）
    When 我將工序改為 "DB"、級別改為 "Ⅱ级"
    And 我點擊「保存」
    Then 指派記錄應更新成功
    And 列表應即時反映新的工序和級別

  Scenario: 編輯員工基本信息
    Given 我在員工詳情頁
    When 我點擊基本信息區域的「編輯」按鈕
    And 我修改部門為 "生產部"
    And 我點擊「保存」
    Then 員工的部門應更新為 "生產部"
```

---

## 9. 報表與匯出 (Reports & Export)

### Feature: 成績報表

```gherkin
Feature: 考試成績報表
  身為 HR 管理員
  我希望查看考試統計數據並匯出報表
  以便進行成績公示與津貼核算

  Scenario: 查看考試統計
    Given 考試 "2026年4月技能考核" 已有 100 名考生成績
    When 我進入報表分析頁面
    And 我選擇該考試
    Then 應顯示:
      | 指標     | 值   |
      | 通過率   | 85%  |
      | 平均分   | 88.5 |
      | 最高分   | 98   |
      | 最低分   | 52   |
    And 應顯示分數分佈圖
    And 應顯示排名分析

  Scenario: 匯出成績 Excel
    Given 我在報表頁面
    When 我點擊「匯出 Excel」
    Then 應下載 Excel 檔案
    And 檔案應包含所有考生的:
      | 姓名 | 工號 | 部門 | 工序 | 級別 | 線上分 | 實操分 | 綜合分 | 是否合格 |

  Scenario: 查看缺考統計
    Given 考試已結束
    When 我查看報表
    Then 應列出所有未參考的考生名單
    And 缺考考生標記為「未參加」
```

---

## 10. 響應式設計 (Responsive Design)

### Feature: 手機端適配

```gherkin
Feature: 手機端考試體驗
  身為使用手機的考生
  我希望在手機豎屏上順暢完成考試
  以便不受裝置限制

  Scenario: 手機端登入
    Given 我使用手機（螢幕寬度 < 768px）
    When 我打開登入頁面
    Then 輸入欄位應佔滿寬度
    And 按鈕應足夠大以便觸控

  Scenario: 手機端作答
    Given 我在手機上考試
    Then 題目文字應清晰可讀
    And 選項按鈕應有足夠的觸控區域
    And 答題導覽列應在底部顯示
    And 浮水印不應遮擋作答區域

  Scenario: 手機端管理後台
    Given 管理員使用手機訪問後台
    Then 資料列表應以卡片形式呈現（非表格）
    And 對話框應以底部彈出方式呈現
```

---

## 11. 安全性 (Security)

### Feature: 資料安全

```gherkin
Feature: 系統資料安全
  身為系統
  我需要確保敏感資料的安全性
  以保護員工隱私和考試公平

  Scenario: 密碼安全儲存
    Given 員工匯入時提供身份證後 6 位 "123456"
    When 資料儲存至資料庫
    Then idCardLast6 應以 AES-256 加密（非明文）
    And verificationCode 應以 bcrypt 雜湊

  Scenario: API 輸入驗證
    When 攻擊者發送包含 SQL 注入的請求
    Then Zod Schema 應拒絕非法輸入
    And 回傳 400 Bad Request

  Scenario: XSS 防護
    When 題目內容包含 HTML 標籤 "<script>alert(1)</script>"
    Then 系統應自動轉義 HTML
    And 前端不應執行任何腳本

  Scenario: 跨角色權限控制
    Given 考生已登入
    When 考生嘗試訪問管理端 API "/api/admin/exams"
    Then 系統應回傳 401 未授權
```

---

## 附錄: Feature 與 Scenario 統計

| Feature | Scenario 數 |
|---------|-------------|
| 考生身份驗證 | 4 |
| 管理員登入 | 1 |
| 題庫批次匯入 | 5 |
| 題庫 CRUD | 3 |
| 建立考試 | 1 |
| 考試狀態管理 | 4 |
| 梯次管理 | 3 |
| 考試作答流程 | 8 |
| 考試篩選 | 2 |
| 多層防作弊 | 4 |
| 即時監控 | 3 |
| 自動評分 | 5 |
| 成績查詢控制 | 3 |
| 員工資料管理 | 4 |
| 成績報表 | 3 |
| 手機端適配 | 3 |
| 資料安全 | 4 |
| **合計** | **60** |
