-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiAlertedAt" TIMESTAMP(3),
ADD COLUMN     "aiBaseUrl" TEXT,
ADD COLUMN     "aiBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiModel" TEXT;

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "aiAlertCallsPerDay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aiAlertTokensPerDay" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "feature" TEXT NOT NULL,
    "keySource" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_feature_createdAt_idx" ON "AiUsage"("feature", "createdAt");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
