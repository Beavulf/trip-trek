-- Публичная ссылка на поездку для родных: read-only страница /p/<token>
-- (галерея + маршрут + карта; деньги/чат/дневник не отдаются). Выключение
-- или rotate токена мгновенно закрывает доступ.
ALTER TABLE "Trip" ADD COLUMN     "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareToken" TEXT;
CREATE UNIQUE INDEX "Trip_shareToken_key" ON "Trip"("shareToken");
