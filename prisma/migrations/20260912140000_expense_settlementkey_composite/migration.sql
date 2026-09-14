-- settlementKey: уникальность в рамках поездки вместо глобальной.
-- Аудит 2026-09-12: глобальный @unique делал ключи разных поездок конфликтующим
-- пространством, а идемпотентный lookup без tripId возвращал чужую трату.
-- Постгрес считает NULLы различными, поэтому переводы без ключа не ограничивает.
-- ВАЖНО: init-миграция создаёт "Expense_settlementKey_key" как CREATE UNIQUE INDEX,
-- а не констрейнт, поэтому DROP CONSTRAINT там падает (P3009 на прод-деплое).
-- Умиваем оба случая: IF EXISTS пропустит отсутствующий констрейнт,
-- DROP INDEX добьёт голый индекс.
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_settlementKey_key";
DROP INDEX IF EXISTS "Expense_settlementKey_key";
CREATE UNIQUE INDEX "Expense_tripId_settlementKey_key" ON "Expense"("tripId", "settlementKey");
