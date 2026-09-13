-- Гейт self-upgrade премиума (аудит 2026-09-12): демо-самовыдача премиума
-- снимала лимиты free-тарифа. По умолчанию выключена; включается из админки,
-- когда появится платёжный провайдер.
ALTER TABLE "AppSettings" ADD COLUMN "selfUpgradeEnabled" BOOLEAN NOT NULL DEFAULT false;
