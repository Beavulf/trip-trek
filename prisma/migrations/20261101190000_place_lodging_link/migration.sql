-- AlterTable
ALTER TABLE "Place" ADD COLUMN "lodgingId" TEXT;

-- CreateIndex
CREATE INDEX "Place_lodgingId_idx" ON "Place"("lodgingId");

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_lodgingId_fkey" FOREIGN KEY ("lodgingId") REFERENCES "Lodging"("id") ON DELETE SET NULL ON UPDATE CASCADE;
