-- Публичная страница: тумблер «гости могут скачать ZIP всех фото»
-- и счётчик гостевых сердечек (/p/<token>/heart).
-- Заодно закрывает дрейф: @@unique на TripBan был в схеме, но не доехал
-- до БД в миграции 20261021150000_photo_content_hash.
-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "shareAllowDownload" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shareHearts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "TripBan_tripId_userId_key" ON "TripBan"("tripId", "userId");
