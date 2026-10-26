-- Режим техработ и баннер-объявление (additive: старый код колонок не читает)
ALTER TABLE "AppSettings" ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "maintenanceMessage" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "announcement" TEXT;
