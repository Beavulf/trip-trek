-- Поездки из шаблона получали конец «старт + N суток» и длились на день дольше своих дней.
-- Условие точное: только нетронутые шаблонные записи (старт ровно в 12:00, конец ровно через N суток).
-- Поездку, у которой меняли даты или дни, оно не задевает: там значения уже другие.
UPDATE "Trip"
SET "endDate" = date_trunc('day', "startDate")
  + ("totalDays" - 1) * INTERVAL '1 day'
  + INTERVAL '23 hours 59 minutes 59.999 seconds'
WHERE "endDate" IS NOT NULL
  AND "totalDays" >= 1
  AND "startDate"::time = TIME '12:00:00'
  AND "endDate" = "startDate" + "totalDays" * INTERVAL '1 day';
