-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "donationAlertsToken" TEXT;

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'donationalerts',
    "donaterName" TEXT,
    "daUsername" TEXT,
    "message" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "donatedAt" TIMESTAMP(3) NOT NULL,
    "matchedUserId" TEXT,
    "matchedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Donation_externalId_key" ON "Donation"("externalId");

-- CreateIndex
CREATE INDEX "Donation_donatedAt_idx" ON "Donation"("donatedAt");

-- CreateIndex
CREATE INDEX "Donation_matchedUserId_idx" ON "Donation"("matchedUserId");

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_matchedUserId_fkey" FOREIGN KEY ("matchedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
