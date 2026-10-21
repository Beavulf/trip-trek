-- Отпечаток содержимого фото (sha256 оригинала) для дедупа загрузок:
-- батч помечает уже загруженные кадры, POST отклоняет повтор.
ALTER TABLE "Photo" ADD COLUMN     "contentHash" TEXT;
CREATE INDEX "Photo_tripId_contentHash_idx" ON "Photo"("tripId", "contentHash");
