-- AlterTable
ALTER TABLE "AppSettings"
ADD COLUMN "webmoneyMerchantSecret" TEXT,
ADD COLUMN "webmoneyMerchantSecretX20" TEXT;

-- CreateTable
CREATE TABLE "WebMoneyPayment" (
    "id" TEXT NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "userId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sysTransNo" TEXT,
    "donationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "WebMoneyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebMoneyPayment_paymentNo_key" ON "WebMoneyPayment"("paymentNo");
CREATE UNIQUE INDEX "WebMoneyPayment_sysTransNo_key" ON "WebMoneyPayment"("sysTransNo");
CREATE UNIQUE INDEX "WebMoneyPayment_donationId_key" ON "WebMoneyPayment"("donationId");
CREATE INDEX "WebMoneyPayment_userId_createdAt_idx" ON "WebMoneyPayment"("userId", "createdAt");
CREATE INDEX "WebMoneyPayment_status_createdAt_idx" ON "WebMoneyPayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "WebMoneyPayment"
ADD CONSTRAINT "WebMoneyPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "WebMoneyPayment_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
