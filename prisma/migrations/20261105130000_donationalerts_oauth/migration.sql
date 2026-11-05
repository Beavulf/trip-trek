ALTER TABLE "AppSettings"
ADD COLUMN "donationAlertsRefreshToken" TEXT,
ADD COLUMN "donationAlertsTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "donationAlertsClientId" TEXT,
ADD COLUMN "donationAlertsClientSecret" TEXT;
