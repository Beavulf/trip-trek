# TripTrek — оставшиеся дыры (закрыто 2026-08-12)

Для прод-тестов закрыты gaps из ревью архива (6).

## Сделано

- `GET /api/search` — auth + всё scoped по `tripId`
- `GET /api/days` — `requireTripMember`
- `GET/POST /api/trips` — только сессия, без spoof `userId` / dump всех поездок
- `GET/PATCH /api/participants` + `PATCH .../[id]` — membership; роль только owner
- `GET/POST/PATCH /api/limits` — сессия, owner = JWT
- `POST /api/trips/from-template` — owner = JWT
- `GET/POST/PUT /api/push` — requireUser + stub flag
- Реактивный `useCurrentTripId` + `setTripId` синхронит Zustand + LS
- Хуки query читают `useCurrentTripId`
- Board POST без client `userId`
- Push: честный stub-copy, disable без trip
- Profile: «TripTrek» вместо «TripTrek China»

## Smoke для тестов

1. Без cookie: `GET /api/trips` → 401; `GET /api/search?q=test&tripId=x` → 401
2. С cookie, чужой tripId: days/search/participants → 403
3. Switch поездки в UI → данные меняются без reload
4. Create from template → поездка на текущего юзера
5. Search без tripId → 400
