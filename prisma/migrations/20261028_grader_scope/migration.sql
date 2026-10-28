-- PRD F2：評卷人帳號與工序權限隔離

ALTER TABLE `admins`
  ADD COLUMN `is_shared` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `auth_source` VARCHAR(191) NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `last_login_at` DATETIME(3) NULL;

-- 評卷人 ↔ 負責工序（多對多）
CREATE TABLE `admin_scopes` (
  `id` VARCHAR(191) NOT NULL,
  `admin_id` VARCHAR(191) NOT NULL,
  `process` VARCHAR(191) NOT NULL,
  `department` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `admin_scopes_admin_id_process_key` (`admin_id`, `process`),
  INDEX `admin_scopes_process_idx` (`process`),
  CONSTRAINT `admin_scopes_admin_id_fkey` FOREIGN KEY (`admin_id`)
    REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
