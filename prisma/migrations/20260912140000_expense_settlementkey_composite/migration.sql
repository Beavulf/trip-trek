-- settlementKey: уникальность в рамках поездки вместо глобальной.
-- Аудит 2026-09-12: глобальный @unique делал ключи разных поездок конфликтующим
-- пространством, а идемпотентный lookup без tripId возвращал чужую трату.
-- Постгрес считает NULLы различными, поэтому переводы без ключа не ограничивает.
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_settlementKey_key";
CREATE UNIQUE INDEX "Expense_tripId_settlementKey_key" ON "Expense"("tripId", "settlementKey");
