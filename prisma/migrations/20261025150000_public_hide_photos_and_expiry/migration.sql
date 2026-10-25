-- Публичная страница: скрытие отдельных фото от гостей и срок действия ссылки

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "hiddenFromPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "shareExpiresAt" TIMESTAMP(3);
