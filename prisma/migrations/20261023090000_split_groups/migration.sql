-- CreateTable
CREATE TABLE "SplitGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🏠',
    "color" TEXT NOT NULL DEFAULT '#10b981',
    "currency" TEXT NOT NULL DEFAULT 'BYN',
    "inviteCode" TEXT NOT NULL,
    "allowMemberInvites" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "displayName" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '👤',
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "SplitMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitExpense" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "paidById" TEXT NOT NULL,
    "spentOn" DATE NOT NULL,
    "note" TEXT,
    "splitMode" TEXT NOT NULL DEFAULT 'equal',
    "createdById" TEXT NOT NULL,
    "recurringId" TEXT,
    "recurringPeriod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitShare" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "weight" INTEGER,

    CONSTRAINT "SplitShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitPayment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "clientKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitRecurring" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidById" TEXT NOT NULL,
    "splitMode" TEXT NOT NULL DEFAULT 'equal',
    "template" JSONB NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "skippedPeriods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitRecurring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitActivity" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SplitGroup_inviteCode_key" ON "SplitGroup"("inviteCode");

-- CreateIndex
CREATE INDEX "SplitMember_userId_idx" ON "SplitMember"("userId");

-- CreateIndex
CREATE INDEX "SplitMember_groupId_status_idx" ON "SplitMember"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SplitMember_groupId_userId_key" ON "SplitMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "SplitExpense_groupId_spentOn_idx" ON "SplitExpense"("groupId", "spentOn");

-- CreateIndex
CREATE INDEX "SplitExpense_paidById_idx" ON "SplitExpense"("paidById");

-- CreateIndex
CREATE UNIQUE INDEX "SplitExpense_recurringId_recurringPeriod_key" ON "SplitExpense"("recurringId", "recurringPeriod");

-- CreateIndex
CREATE INDEX "SplitShare_memberId_idx" ON "SplitShare"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SplitShare_expenseId_memberId_key" ON "SplitShare"("expenseId", "memberId");

-- CreateIndex
CREATE INDEX "SplitPayment_groupId_paidOn_idx" ON "SplitPayment"("groupId", "paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "SplitPayment_groupId_clientKey_key" ON "SplitPayment"("groupId", "clientKey");

-- CreateIndex
CREATE INDEX "SplitRecurring_groupId_active_idx" ON "SplitRecurring"("groupId", "active");

-- CreateIndex
CREATE INDEX "SplitActivity_groupId_createdAt_idx" ON "SplitActivity"("groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "SplitMember" ADD CONSTRAINT "SplitMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitMember" ADD CONSTRAINT "SplitMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitExpense" ADD CONSTRAINT "SplitExpense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitExpense" ADD CONSTRAINT "SplitExpense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "SplitMember"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitExpense" ADD CONSTRAINT "SplitExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "SplitMember"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitExpense" ADD CONSTRAINT "SplitExpense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "SplitRecurring"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitShare" ADD CONSTRAINT "SplitShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SplitExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitShare" ADD CONSTRAINT "SplitShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SplitMember"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "SplitMember"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_toId_fkey" FOREIGN KEY ("toId") REFERENCES "SplitMember"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "SplitMember"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitRecurring" ADD CONSTRAINT "SplitRecurring_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitActivity" ADD CONSTRAINT "SplitActivity_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Инварианты денег на уровне БД (Prisma их не моделирует; дрейфа схемы это не вызывает):
-- сумма/перевод строго положительны, доля неотрицательна, перевод — между разными людьми
ALTER TABLE "SplitExpense" ADD CONSTRAINT "SplitExpense_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "SplitShare" ADD CONSTRAINT "SplitShare_cents_nonneg" CHECK ("cents" >= 0);
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_distinct_parties" CHECK ("fromId" <> "toId");
ALTER TABLE "SplitRecurring" ADD CONSTRAINT "SplitRecurring_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "SplitRecurring" ADD CONSTRAINT "SplitRecurring_dayOfMonth_range" CHECK ("dayOfMonth" BETWEEN 1 AND 31);
