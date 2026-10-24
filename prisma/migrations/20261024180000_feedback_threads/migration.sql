-- Обратная связь: переписка, гостевые обращения, расширенный контекст.

-- AlterTable
ALTER TABLE "Feedback"
    ADD COLUMN "screen" TEXT,
    ADD COLUMN "viewport" TEXT,
    ADD COLUMN "appVersion" TEXT,
    ADD COLUMN "contactEmail" TEXT,
    ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "userSeenAt" TIMESTAMP(3);

-- Очередь сортируется по последней активности: у старых обращений это ответ админа или дата создания
UPDATE "Feedback" SET "lastActivityAt" = COALESCE("repliedAt", "createdAt");

-- CreateTable
CREATE TABLE "FeedbackMessage" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

-- Одиночный ответ админа из прошлой схемы становится первой репликой переписки;
-- автор его уже видел — «непрочитанным» он не должен всплыть
INSERT INTO "FeedbackMessage" ("id", "feedbackId", "author", "body", "createdAt")
SELECT 'fm_' || "id", "id", 'admin', "adminReply", COALESCE("repliedAt", "createdAt")
FROM "Feedback"
WHERE "adminReply" IS NOT NULL AND btrim("adminReply") <> '';

UPDATE "Feedback" SET "userSeenAt" = CURRENT_TIMESTAMP WHERE "adminReply" IS NOT NULL;

-- DropIndex
DROP INDEX "Feedback_status_createdAt_idx";

-- CreateIndex
CREATE INDEX "Feedback_status_lastActivityAt_idx" ON "Feedback"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "FeedbackMessage_feedbackId_createdAt_idx" ON "FeedbackMessage"("feedbackId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeedbackMessage" ADD CONSTRAINT "FeedbackMessage_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
