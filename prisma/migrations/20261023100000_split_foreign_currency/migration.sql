-- «Сочтёмся»: трата/шаблон можно вносить в валюте, отличной от валюты группы. amountCents остаётся суммой в валюте
-- группы (в ней считаются долги), введённое — в originalAmountCents/originalCurrency. Только новые nullable-колонки.
-- AlterTable
ALTER TABLE "SplitExpense" ADD COLUMN     "originalAmountCents" INTEGER,
ADD COLUMN     "originalCurrency" TEXT;

-- AlterTable
ALTER TABLE "SplitRecurring" ADD COLUMN     "originalAmountCents" INTEGER,
ADD COLUMN     "originalCurrency" TEXT;

-- Инварианты: исходная сумма и валюта — только парой; сумма положительна; код валюты — три заглавные буквы.
-- IS NOT NULL явно: в CHECK результат NULL считается «не нарушено», и без него сумма без валюты проходила бы
ALTER TABLE "SplitExpense" ADD CONSTRAINT "SplitExpense_original_pair" CHECK (
  ("originalAmountCents" IS NULL AND "originalCurrency" IS NULL)
  OR ("originalAmountCents" IS NOT NULL AND "originalCurrency" IS NOT NULL AND "originalAmountCents" > 0 AND "originalCurrency" ~ '^[A-Z]{3}$')
);
ALTER TABLE "SplitRecurring" ADD CONSTRAINT "SplitRecurring_original_pair" CHECK (
  ("originalAmountCents" IS NULL AND "originalCurrency" IS NULL)
  OR ("originalAmountCents" IS NOT NULL AND "originalCurrency" IS NOT NULL AND "originalAmountCents" > 0 AND "originalCurrency" ~ '^[A-Z]{3}$')
);
