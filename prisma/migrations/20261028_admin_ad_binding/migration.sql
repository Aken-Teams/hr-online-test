-- PRD F2-8：後台 AD 帳號綁定
ALTER TABLE `admins`
  ADD COLUMN `ad_username` VARCHAR(191) NULL,
  ADD COLUMN `ad_domain` VARCHAR(191) NULL;

-- 同一網域下的 AD 工號只能綁定一個後台帳號
CREATE UNIQUE INDEX `admins_ad_domain_ad_username_key` ON `admins`(`ad_domain`, `ad_username`);
