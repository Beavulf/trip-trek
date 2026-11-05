ALTER TABLE "Trip"
ADD COLUMN "creationSource" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "firstUserPlaceAddedAt" TIMESTAMP(3);
