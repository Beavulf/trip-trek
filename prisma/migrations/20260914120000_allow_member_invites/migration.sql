-- Кто может приглашать участников: true — все участники (как было), false — только владелец.
-- При false GET /api/trip прячет inviteCode от не-владельцев, join остаётся по коду.
ALTER TABLE "Trip" ADD COLUMN "allowMemberInvites" BOOLEAN NOT NULL DEFAULT true;
