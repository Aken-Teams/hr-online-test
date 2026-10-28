-- PRD F3：AI 輔助評分（建議分數 + 評分依據 + 分數來源標示）
ALTER TABLE `answers`
  ADD COLUMN `ai_score` INT NULL,
  ADD COLUMN `ai_reason` TEXT NULL,
  ADD COLUMN `ai_key_points` JSON NULL,
  ADD COLUMN `ai_confidence` VARCHAR(191) NULL,
  ADD COLUMN `ai_model` VARCHAR(191) NULL,
  ADD COLUMN `ai_graded_at` DATETIME(3) NULL,
  ADD COLUMN `score_source` VARCHAR(191) NULL;

-- PRD F4-2：離開畫面達門檻是否強制交卷（本次考試設為 0 = 僅提醒與記錄）
ALTER TABLE `exams`
  ADD COLUMN `force_submit_on_tab_switch` BOOLEAN NOT NULL DEFAULT true;
