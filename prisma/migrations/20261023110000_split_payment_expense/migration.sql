-- «Сочтёмся»: перевод можно привязать к конкретной трате («за интернет я перевёл»). Связь необязательная и
-- информационная — на балансе пары это по-прежнему обычный перевод. Трату удалили — перевод остаётся (SET NULL).
-- AlterTable
ALTER TABLE "SplitPayment" ADD COLUMN     "expenseId" TEXT;

-- CreateIndex
CREATE INDEX "SplitPayment_expenseId_idx" ON "SplitPayment"("expenseId");

-- AddForeignKey
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SplitExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
