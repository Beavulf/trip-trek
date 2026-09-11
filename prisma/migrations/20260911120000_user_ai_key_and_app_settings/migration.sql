-- Свой ключ ИИ у пользователя + общий админский ключ (BYOK: user → admin → env)
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiApiKey" TEXT;

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "aiApiKey" TEXT,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
