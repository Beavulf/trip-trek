-- Base URL и модель ИИ: настройка сервера, без них ключ не-OpenAI провайдера
-- (Z.ai, OpenRouter и т.п.) уходил бы на api.openai.com и отбивался 401
-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "aiBaseUrl" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN     "aiModel" TEXT;
