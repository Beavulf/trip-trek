-- «Сочтёмся»: напоминания о долгах (ADR-0010)

-- AlterTable
ALTER TABLE "SplitGroup" ADD COLUMN "remindAfterDays" INTEGER;

-- CreateTable
CREATE TABLE "SplitReminder" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SplitReminder_groupId_fromId_toId_createdAt_idx" ON "SplitReminder"("groupId", "fromId", "toId", "createdAt");

-- AddForeignKey
ALTER TABLE "SplitReminder" ADD CONSTRAINT "SplitReminder_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
