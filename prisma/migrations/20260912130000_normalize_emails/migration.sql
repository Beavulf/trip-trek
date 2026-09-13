-- Канонизация email (аудит 2026-09-12): приложение теперь хранит и ищет адреса
-- в едином виде trim().toLowerCase() (register/custom-login/forgot-password).
-- Конфликты регистровых дублей перед накатом проверить вручную:
--   SELECT lower(email), count(*) FROM "User" GROUP BY lower(email) HAVING count(*) > 1;
-- Если запрос вернул строки — дубли сначала слить вручную, иначе UPDATE упадёт
-- на уникальном индексе.
UPDATE "User" SET email = lower(trim(email)) WHERE email != lower(trim(email));
