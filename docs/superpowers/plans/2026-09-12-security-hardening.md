# Security Hardening (public launch) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** закрыть 27 находок аудита безопасности 2026-09-12 (run-1) перед публичным запуском — параллельные пути с ослабленными проверками, разрывы ревокации/владения, безлимитные публичные поверхности, demo-режим тарифа.

**Architecture:** правки точечные, в существующем стиле проекта (ручная валидация без zod, гарды `src/lib/api-auth.ts`, лимитеры `src/lib/rate-limit.ts`, realtime через `publish()`). Каждая задача — самостоятельный коммит с проверкой curl-рецептом и обновлением затронутых доков тем же коммитом.

**Tech Stack:** Next.js 16 App Router (route handlers), Bun (`bun server.ts`), Prisma 6 + PostgreSQL, socket.io, jsonwebtoken, web-push.

**Источник находок:** `C:\Users\world\security-audit-skill\trip-trek\run-1\` — `REPORT.md`, `NEEDS-VALIDATION.md`, `findings.json` (фингерпринты в скобках у задач). Все записи `needs_validation`: перед «исправлением» конкретного лида его локальная curl-проверка из NEEDS-VALIDATION.md может быть выполнена один раз на dev-стеке для подтверждения (необязательно — исходники однозначны).

## Global Constraints

- Комментарии в коде — по-русски, объясняют «почему» (правило AGENTS.md).
- Доки — в том же коммите: правки API-роутов → таблица в `docs/api.md` (+ «Rate limits» при изменении лимитов); WS-поведение → §4 `docs/architecture.md`; новые env/команды → `docker-deploy/DEPLOY.md`.
- Рантайм Bun; `server.ts` не «упрощать» (AsyncLocalStorage-шимма до импорта next); Turbopack не включать.
- Валидация — вручную, в стиле соседних файлов (zod в зависимостях не используется — глобально не внедрять).
- Каждый шаг проверки: `bun run lint` зелёный; прод-сборка не обязательна до финального таска.
- Не запускать `db:seed`/`db:admin` против прод-БД; миграции — через `bun run db:migrate` локально, на проде `prisma migrate deploy` (entrypoint).
- Демо-аккаунты для локальных проверок: `you@/leha@/den@triptrek.com`, пароль `1234` (только dev).

---

### Task 1: Единый вход — лимитер на NextAuth, login-CSRF, канонизация email

**Files:**
- Modify: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `src/app/api/auth/custom-login/route.ts`
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/custom-login/route.ts` (поиск email), `src/app/api/auth/forgot-password/route.ts` (поиск email)
- Create: `prisma/migrations/<timestamp>_normalize_emails/migration.sql`
- Docs: `docs/api.md` (строка про лимит auth)

**Interfaces:**
- Consumes: `rateLimitMiddleware(req, prefix, max, windowMs)` из `src/lib/rate-limit.ts` (возвращает `Response | null`).
- Produces: все пути логина ограничены 5/15мин/IP; email хранится и сравнивается как `trim().toLowerCase()`.

- [ ] **Step 1: Лимитер на NextAuth POST** (`src/app/api/auth/[...nextauth]/route.ts`). Обернуть обработчик (это закрывает `auth.nextauth-credentials.unthrottled-login`):

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimitMiddleware } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

// NextAuth v4 не имеет собственного троттлинга: без обёртки callback/credentials —
// неограниченный перебор паролей в обход лимита custom-login (находка аудита 2026-09-12).
const throttledPost = async (req: Request) => {
  const limited = await rateLimitMiddleware(req, "login", 5, 15 * 60_000);
  if (limited) return limited;
  return handler(req);
};

export { handler as GET, throttledPost as POST };
```

- [ ] **Step 2: login-CSRF guard** (`src/app/api/auth/custom-login/route.ts`, сразу в начале GET-обработчика POST). Межсайтовая text/plain-форма парсится `req.json()` — требуем same-origin Origin и JSON:

```ts
// login-CSRF: только наш origin и только JSON — text/plain-форма не должна доезжать до Set-Cookie
const origin = req.headers.get("origin");
if (origin) {
  const allowed = new URL(process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;
  if (origin !== allowed) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
}
const contentType = req.headers.get("content-type") ?? "";
if (!contentType.includes("application/json")) {
  return NextResponse.json({ error: "Ожидался JSON" }, { status: 415 });
}
```

- [ ] **Step 3: Канонизация email.** В `register/route.ts` перед `db.user.create` и перед проверкой существования: `const email = rawEmail.trim().toLowerCase();` (замена обоих использований). То же в `custom-login/route.ts` (поиск юзера) и `forgot-password/route.ts` (поиск юзера И ключ per-email-лимитера — иначе регистр даёт отдельные бакеты).
- [ ] **Step 4: Миграция нормализации.** `bun run db:migrate` с пустой миграцией, затем в `migration.sql`:

```sql
-- приводим существующие email к единому виду; конфликты регистровых дублей
-- mestами возможны — перед накатом проверить:
--   SELECT lower(email), count(*) FROM "User" GROUP BY lower(email) HAVING count(*) > 1;
UPDATE "User" SET email = lower(trim(email)) WHERE email != lower(trim(email));
```

Если проверочный запрос возвращает строки — НЕ накатывать автоматически: дубли merge-атся вручную (решение владельца).

- [ ] **Step 5: Проверка.** Перезапустить `bun server.ts`; curl-циклом: 6 неверных POST на `/api/auth/callback/credentials` (csrf из `/api/auth/csrf`) → 6-й = 429; POST `custom-login` с `Content-Type: text/plain` → 415; регистрация `Case@Test.local`, затем логин `case@test.local` → успех. `bun run lint`.
- [ ] **Step 6: Commit** — `feat(auth): единый лимитер логина на NextAuth, login-CSRF guard, канонизация email (+миграция)`; в коммит — `docs/api.md` (лимит login распространяется на [...nextauth]).

### Task 2: Регистрация вступает в поездку только по инвайту

**Files:**
- Modify: `src/app/api/auth/register/route.ts` (ветка `tripId`)
- Modify: `src/app/api/trips/join/route.ts` (GET-preview select)
- Docs: `docs/api.md` (register/join)

Fixes: `auth.register.autojoin.skips-invite-ban-cap`.

- [ ] **Step 1: Убрать ветку `tripId`** в `register/route.ts` (блок `if (tripId) { … }` целиком, включая findUnique по id и tripMember.create). Оставить только `inviteCode`.
- [ ] **Step 2: В invite-ветке регистрации добавить те же проверки, что в `/api/trips/join`**: после `db.trip.findUnique` по коду — проверка `TripBan` для нового юзера и капа членов (считать `tripMember.count({ where: { tripId } })` против лимита плана ВЛАДЕЛЬца поездки через `getPlanLimits`/`isPremiumUser` из `src/lib/premium.ts`, как в `trips/join/route.ts:64-80`). Если копировать не хочется — вынести общий хелпер `joinTripByCode(tx, trip, userId)` в `src/lib/trip-join.ts` и использовать его из обоих роутов (предпочтительно).
- [ ] **Step 3: Убрать `id: true` из select анонимного preview** (`trips/join/route.ts:~119`). Проверить клиент: `src/app` страницы `/join` используют только `code` (после Task 2 регистрация по tripId невозможна, id клиенту не нужен).
- [ ] **Step 4: Проверка.** Регистрация с `{tripId}` в теле → в ответе нет членства (поле игнорируется); регистрация с просроченным лимитом/забаненным кодом → ошибка; анонимный GET `/api/trips/join?code=` не содержит `id`. `bun run lint`.
- [ ] **Step 5: Commit** — `fix(auth): регистрация вступает в поездку только по инвайт-коду, с проверками бана и лимита`.

### Task 3: WebSocket — ревокация пароля и исключение из поездки

**Files:**
- Modify: `server/ws-auth.ts`
- Modify: `server/socket-handlers.ts`
- Modify: `src/lib/ws-bus.ts` (или новый `server/evict.ts`)
- Modify: `src/app/api/participants/[id]/route.ts`, `src/app/api/participants/ban/route.ts`, `src/app/api/participants/leave/route.ts`, `src/app/api/admin/trips/members/route.ts` (вызовы eviction)
- Docs: `docs/architecture.md` §4 (realtime)

Fixes: `auth.ws-handshake.missing-passwordChangedAt`, `ws.removed-member-keeps-room-events`.

- [ ] **Step 1: handshake с проверкой БД.** `server/ws-auth.ts` сделать async-мидлварью: после `jwt.verify` загрузить юзера и сверить ревокацию (тот же инвариант, что `api-auth.ts:63-74`):

```ts
const user = await db.user.findUnique({ where: { id: userId }, select: { passwordChangedAt: true } });
if (!user) return next(new Error("unauthorized"));
if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
  return next(new Error("unauthorized")); // смена пароля убивает и WS-сессии
}
socket.data.userId = userId; // нужен для eviction
```

- [ ] **Step 2: Eviction при удалении членства.** В `src/lib/ws-bus.ts` добавить:

```ts
// исключённый участник не должен получать события поездки до переподключения
export async function evictUserFromTrip(tripId: string, userId: string) {
  const io = getIo();
  if (!io) return;
  const sockets = await io.in(`trip:${tripId}`).fetchSockets();
  for (const s of sockets) {
    if (s.data.userId === userId) s.leave(`trip:${tripId}`);
  }
}
```

Вызвать после `db.tripMember.delete` в четырёх роутax удаления (participants/[id], participants/ban, participants/leave, admin/trips/members). Убедиться, что ws-auth кладёт `socket.data.userId` (Step 1).
- [ ] **Step 3: Мелкие границы WS.** В `server.ts` при создании io: `maxHttpBufferSize: 64 * 1024`; в реле `board:typing` обрезать `userName` до 32 символов.
- [ ] **Step 4: Проверка.** Два браузера: you@ исключает leha@ → у leha@ вкладка больше не получает `place:created` без перезагрузки; смена пароля leha@ → старый токен не проходит handshake (socket.io-client с сохранённой кукой → connect_error).
- [ ] **Step 5: Commit** — `fix(ws): ревокация пароля на handshake, выселение исключённых участников из комнат`.

### Task 4: Привязка dayId к поездке + составной settlementKey

**Files:**
- Modify: `src/app/api/places/route.ts`, `src/app/api/places/[id]/route.ts`, `src/app/api/expenses/route.ts`, `src/app/api/photos/route.ts`
- Modify: `prisma/schema.prisma` (Expense)
- Create: миграция `expense_settlementkey_composite`
- Docs: `docs/api.md` (expenses), `docs/architecture.md` §5 если меняется семантика ключа

Fixes: `authz.dayid-cross-trip-binding`, `authz.settlementkey-global-namespace`.

- [ ] **Step 1: Хелпер** в `src/lib/trip-days.ts`:

```ts
// день обязан принадлежать той же поездке, что и ссылающаяся запись
// (инвариант уже есть у journal и photos/[id] — аудитет 2026-09-12 нашёл 4 пути без него)
export async function assertDayInTrip(tripId: string, dayId: string | null | undefined) {
  if (!dayId) return;
  const day = await db.day.findFirst({ where: { id: dayId, tripId }, select: { id: true } });
  if (!day) throw new HttpError(400, "День не найден в этой поездке");
}
```

(если в проекте нет общего HttpError — вернуть `null` и обрабатывать в каждом роуте, как у journal.)
- [ ] **Step 2: Применить** в places POST, places/[id] PATCH (перед update), expenses POST, photos POST (после парса formData, до create). Образец — `journal/route.ts:62-68`.
- [ ] **Step 3: settlementKey.** В `prisma/schema.prisma` у Expense: заменить `settlementKey String? @unique` на скаляр + `@@unique([tripId, settlementKey])`. Миграция:

```sql
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_settlementKey_key";
CREATE UNIQUE INDEX "Expense_tripId_settlementKey_key" ON "Expense"("tripId","settlementKey");
```

В `expenses/route.ts` идемпотентность: `findFirst({ where: { settlementKey, tripId } })`; чужая строка больше не видна в принципе (scoped-запрос).
- [ ] **Step 4: Проверка.** PATCH места чужим dayId → 400; POST расхода с тем же settlementKey в другой поездке → создаёт СВОЙ расход (а не возвращает чужой). `bun run db:migrate` зелёный; `bun run lint`.
- [ ] **Step 5: Commit** — `fix(data): dayId только внутри своей поездки; settlementKey уникален в рамках поездки`.

### Task 5: Политики — ban-list только для владельца, totalBudget без дубля

**Files:**
- Modify: `src/app/api/participants/ban/route.ts` (GET)
- Modify: `src/app/api/trips/[tripId]/route.ts` (whitelist)
- Docs: `docs/api.md`

Fixes: `authz.member-email-to-all-members`, `authz.totalbudget-member-writable`. **Требует решения владельца** (отмечено в аудите): по умолчанию здесь выбран вариант «UI-поведение важнее» — pencils редактирования бюджета видны всем членам, поэтому totalBudget остаётся member-редактируемым, а из owner-only whitelist дубль убирается. Если владелец хочет наоборот — вместо этого добавить проверку роли в `trip/budget/route.ts` и перекинуть UI на owner-путь.

- [ ] **Step 1:** в `participants/ban/route.ts` GET после `requireTripMember` — проверить `role === "owner"` (403 иначе), и убрать `email` из `select` юзера в списке банов (leave `id/name/emoji/color`).
- [ ] **Step 2:** в `trips/[tripId]/route.ts` убрать `totalBudget` из allowed-fields PATCH и поправить комментарий (:25-26) — указать, что бюджет меняется через `/api/trip/budget` и доступен всем членам (решение из аудита 2026-09-12).
- [ ] **Step 3: Проверка.** leha@ (не владелец): GET `/api/participants/ban` → 403; PATCH `/api/trips/<id>` c totalBudget → не меняет его; PATCH `/api/trip/budget` → работает.
- [ ] **Step 4: Commit** — `fix(trip): ban-list только владельцу и без email; totalBudget — единственный путь через /api/trip/budget`.

### Task 6: Файлы — avatarUrl только свой, multipart за гар дом

**Files:**
- Modify: `src/app/api/user/route.ts`, `src/app/api/user/avatar/route.ts`
- Modify: `src/app/api/photos/route.ts`, `src/app/api/foods/route.ts`
- Docs: `docs/api.md` (photos/foods — порядок проверок не виден клиенту, но лимиты те же)

Fixes: `upload.avatarurl-cross-user-file-delete`, `upload.preauth-multipart-buffer`.

- [ ] **Step 1: avatarUrl — формат + безопасное удаление.** В `user/route.ts` (:173) принимать только `null`/`""`/строки с префиксом `/uploads/avatar-` (файлы аватарок создаются storagePut с префиксом `avatar-` — сверить фактический префикс в `src/lib/storage/index.ts:141-153` и использовать его). В `user/avatar/route.ts` перед `storageRemove(prev.avatarUrl)`: пропустить удаление, если на этот URL всё ещё ссылается ЧУЖАЯ строка:

```ts
// не удаляем файл, если на него ссылается кто-то ещё (аудит: cross-user file delete)
const [otherUser, otherPhoto] = await Promise.all([
  db.user.findFirst({ where: { avatarUrl: prev.avatarUrl, id: { not: user.id } }, select: { id: true } }),
  db.photo.findFirst({ where: { url: prev.avatarUrl }, select: { id: true } }),
]);
if (!otherUser && !otherPhoto) await storageRemove(prev.avatarUrl);
```

- [ ] **Step 2: Порядок гар дов.** В `photos/route.ts`: `requireTripMember` + `userRateLimit` ПЕРЕД `await req.formData()` (как в `user/avatar:10-17`). В `foods/route.ts`: то же для multipart-ветки и для JSON-ветки (поднять membership-проверку выше parse). tripId для гар да берётся из query/поля формы — читать поле `tripId` формы через `formData().get()` уже после parse нельзя, поэтому: читать `tripId` из `req.headers` нельзя; корректный порядок — сначала `requireUser`, затем лёгкий `userRateLimit`, затем parse, затем `requireTripMember(tripId)`. Применить ровно эту последовательность (полная защита от анонимного парсинга сохраняется первым requireUser).
- [ ] **Step 3: Проверка.** Анонимный POST 20MB на `/api/photos` → 401 без роста RSS (несколько запросов подряд); leha@ прописывает чужой photo-URL в avatarUrl → 400 (префикс); с чужим avatar-URL (подделка префикса) → при следующей загрузке аватарки чужой файл не удаляется.
- [ ] **Step 4: Commit** — `fix(upload): avatarUrl только свои аватарки; гарды до парсинга multipart`.

### Task 7: Публичная поверхность — health, weather, geocode, краш /uploads

**Files:**
- Modify: `src/app/api/health/route.ts`, `src/app/api/weather/route.ts`, `src/app/api/geocode/route.ts`
- Modify: `server/static-uploads.ts`
- Docs: `docs/api.md` (Rate limits: +health 60/min/IP, +weather 30/min/IP, +geocode 60/h/user)

Fixes: `public.health-unauthenticated-db-ping-flood`, `public.unthrottled-outbound-proxy-weather-geocode`, `public.uploads-readstream-uncaught-exit`.

- [ ] **Step 1: health.** Кэш статуса на 5 секунд (module-level переменная с timestamp) + `rateLimitMiddleware(req, "health", 60, 60_000)` первой строкой. Healthcheck compose (1 req/30s) не страдает.
- [ ] **Step 2: weather.** `rateLimitMiddleware(req, "weather", 30, 60_000)` первой строкой; lat/lng — числовая валидация диапазона `Math.abs(lat) <= 90`, `Math.abs(lng) <= 180` (как в nearby:32).
- [ ] **Step 3: geocode.** `userRateLimit(req, user.id, "geocode", 60, 3600_000)` после requireUser; lat/lng — та же числовая валидация перед интерполяцией в URL (это же снимает question про raw-строки в Nominatim).
- [ ] **Step 4: static-uploads не роняет процесс.** Обернуть тело `handleUploadsRequest` в try/catch (любое исключение → 500, без проброса), и стриму — обработчик ошибки:

```ts
const stream = createReadStream(filePath);
stream.on("error", () => {
  if (!res.headersSent) res.writeHead(404, { "Content-Type": "text/plain" });
  res.destroy();
});
stream.pipe(res);
```

- [ ] **Step 5: Проверка.** 5 быстрых GET /api/health → ответ из кэша (один SELECT в логах); weather с lat=999 → 400; параллельные GET+DELETE загруженной фотографии (10 итераций) → сервер жив.
- [ ] **Step 6: Commit** — `fix(public): лимиты на health/weather/geocode, /uploads не роняет процесс`.

### Task 8: Лимиты контента и списков

**Files:**
- Modify: `src/app/api/checklist/route.ts`, `src/app/api/info/route.ts`, `src/app/api/places/route.ts`, `src/app/api/places/[id]/route.ts`, `src/app/api/trips/route.ts`, `src/app/api/days/route.ts`, `src/app/api/photos/route.ts` (caption/address), `src/app/api/expenses/route.ts` (category), `src/app/api/foods/route.ts` (POST-ветка)
- Modify: `src/app/api/search/route.ts`, `src/app/api/board/route.ts`, `src/app/api/photos/route.ts` (GET take)
- Docs: `docs/api.md` (Rate limits: search)

Fixes: `res.unbounded-text-fields-search-scan`.

- [ ] **Step 1: Капы полей** — в стиле существующих: `text.slice(0, 2000)` для checklist/info/place-полей (места: name 200, description 2000, address 300, category 50, timeOfDay 20; checklist text 500; info title 200 / content 10_000; trips title 100 / destination 100; days title/summary 200/2000; photos caption 300 (как в photos/[id]) / address 300; expenses category 50; foods POST — те же капы, что в PATCH-ветке). Обрезать (slice), а не отклонять — дружелюбнее к клиентам.
- [ ] **Step 2: Предохранители списков.** В GET-ветках board/photos/expenses/journal/checklist/info/foods добавить `take: 1000` (клиент не заметит, но мегабайтные затравки не уйдут бесконечно); в `search/route.ts` — `userRateLimit(req, user.id, "search", 30, 60_000)`.
- [ ] **Step 3: Проверка.** POST места с description 100KB → в ответе/БД обрезано до 2000; `GET /api/board` по поездке с >1000 сообщений → 1000. `bun run lint`.
- [ ] **Step 4: Commit** — `fix(api): капы длин пользовательских полей и предохранители списков`.

### Task 9: AI и push — валидация base URL, свой ключ, владение подпиской

**Files:**
- Modify: `src/lib/ai-key.ts`, `src/app/api/admin/settings/route.ts`
- Modify: `src/app/api/user/ai-key-check/route.ts`
- Modify: `src/app/api/push/subscribe/route.ts`, `src/lib/push-send.ts`, `src/lib/notify.ts`
- Modify: `src/app/api/ai-summary/route.ts` (санитизация member-текста)
- Docs: `docs/api.md`, `docs/architecture.md` (AI)

Fixes: `ssrf.ai-baseurl-key-egress`, `ai.keycheck-operator-key-oracle`, `push.endpoint-claim-cross-user`, `res.push-endpoint-no-timeout`, `ai.summary-indirect-injection-markdown-links` (детерминируемая часть).

- [ ] **Step 1: aiBaseUrl — только https.** В `admin/settings` PUT: `new URL(value)`; требовать `protocol === "https:"` (кроме явного `http://localhost*` для dev-отладки — оставить только когда `NODE_ENV !== "production"`). В `openaiChatUrl` (`ai-key.ts:60-69`): если итоговый URL не https (и не localhost в dev) — вернуть дефолт `https://api.openai.com/v1`. `admin/settings/test` перевести на `openaiChatUrl` вместо сырой конкатенации.
- [ ] **Step 2: ai-key-check — только свой ключ.** После `resolveAiConfig`: если `cfg.source !== "user"` → не делать внешний вызов, вернуть `{ ok: true, source, maskedKey: maskKey(cfg.key), checked: false }` с пояснением «общий ключ не проверяется» (админ проверяет его через admin/settings/test). Успешный ответ с `tail` — только при `source === "user"`. Ошибку провайдера наружу — только для `source === "user"`, иначе общий текст.
- [ ] **Step 3: push-подписка.** В `push/subscribe` POST: если `existing && existing.userId !== user.id` → 409 «Э endpoint принадлежит другому устройству» (вместо переassignment); валидация endpoint: `new URL()` и `protocol === "https:"` и hostname не IP-литерал и не `.internal`/`localhost`; `p256dh`/`auth` обязательны непустые.
- [ ] **Step 4: push timeout.** В `notify.ts:76-79` и `push-send.ts:49` передать третьим аргументом `{ timeout: 10_000 }` (web-push поддерживает options.timeout — web-push-lib.js:222).
- [ ] **Step 5: Санитизация member-текста в AI.** В `ai-summary/route.ts` в местах сборки journalTexts/captions (:117-124) нейтрализовать markdown-ссылки, чтобы ни промпт, ни no-LLM-черновик не разносили кликабельные URL:

```ts
// ссылки из member-контента не должны попадать в рендер истории (аудит: markdown-инъекция)
const sanitizeForAi = (t: string) => t.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
```

Применить к journalTexts, captions и адресам. LLM-половину (stering промпта) фиксируем как принятый риск с CSP-рекомендацией — отдельно см. Task 11 (headers).
- [ ] **Step 6: Проверка.** admin PUT `aiBaseUrl: "http://127.0.0.1:9999"` → 400 в прод-режиме; den@ (без ключа) POST ai-key-check → `checked: false`, ноль внешних вызовов; push чужого endpoint → 409; журнал с `[клик](https://192.0.2.10/p)` в no-LLM черновике → текст без ссылки. `bun run lint`.
- [ ] **Step 7: Commit** — `fix(ai,push): https-only base URL, свой ключ в ai-key-check, владение push-подпиской, timeout, санитизация ссылок`.

### Task 10: Деплой и сборка — секреты, dockerignore, порты, volume

**Files:**
- Modify: `docker-deploy/entrypoint.sh`, `docker-deploy/start.sh`, `.dockerignore`, `docker-deploy/compose.smoke.yml`, `docker-deploy/DEPLOY.md`, `railway.toml` (комментарий/доки)
- Docs: `docker-deploy/DEPLOY.md`

Fixes: `deploy.startsh-fallback-secret-bypasses-guard`, `supply.dockerignore-ships-dev-db-and-env-into-image`, `deploy.clientip-trusts-first-xff-hop` (эксплуатационная часть), `deploy.railway-uploads-no-volume-declared`.

- [ ] **Step 1: entrypoint-гард по префиксу.** Заменить точные сравнения на case-паттерны:

```sh
case "$NEXTAUTH_SECRET" in
  ""|"fallback-dev-secret"|change-this-*|change-me-*)
    echo "FATAL: NEXTAUTH_SECRET not set or insecure" >&2; exit 1 ;;
esac
```

- [ ] **Step 2: start.sh без фолбэков.** Убрать `|| echo "change-this-secret-$(date +%s)"`: если `openssl` нет — `echo "FATAL: openssl required to generate NEXTAUTH_SECRET" >&2; exit 1`. Аналогично для sed-ветки (не оставлять placeholder в .env).
- [ ] **Step 3: .dockerignore** — добавить строки `prisma/db`, `**/*.db`, `.env*` (находка: dev.db с реальными данными владельца попадал в образ через `COPY prisma/`).
- [ ] **Step 4: compose.smoke — только loopback.** Порты заменить на `"127.0.0.1:3000:3000"` (смок-стек не должен быть доступен извне — иначе XFF-ключ лимитеров становится клиентским).
- [ ] **Step 5: Доки.** В `DEPLOY.md`: секция «Гарантии»: (а) app:3000 никогда не публикуется наружу — XFF доверяем только за Caddy; (б) Railway: volume на /app/public/uploads (или UPLOADS_DIR) обязателен — иначе redeploy теряет файлы; (в) NEXTAUTH_SECRET только через openssl.
- [ ] **Step 6: Проверка.** `bash -n` на обоих скриптах; локально: NEXTAUTH_SECRET=change-this-secret-123 → entrypoint (с NODE_ENV=production) падает; `docker build` (если доступен) → в образе нет /app/prisma/db/dev.db. На VPS при следующем деплое: `docker run --rm --entrypoint ls triptrek-app -la /app/prisma/db` — пусто.
- [ ] **Step 7: Commit** — `fix(deploy): стойкий гард секретов, dockerignore без dev.db, loopback-порты смока, доки по volume/XFF`.

### Task 11: Тариф — лимит на всех путях создания, гейт self-upgrade, заголовки

**Files:**
- Modify: `src/app/api/trips/route.ts`, `src/app/api/trip/import/route.ts`, `src/app/api/trips/from-template/route.ts`
- Modify: `src/app/api/user/upgrade/route.ts`, `prisma/schema.prisma` (AppSettings), миграция не нужна (JSON-поля singleton — сверить: если AppSettings хранит поля колонками, добавить `selfUpgradeEnabled Boolean @default(false)` + миграция)
- Modify: `src/components/trip/premium-modal.tsx` (обработка 403)
- Modify: `next.config.ts`
- Docs: `docs/api.md`, `docs/glossary.md` (фича «Премиум»)

Fixes: `plan.trip-create-limit-bypass`, `plan.self-upgrade-premium-no-payment`, hardening (headers).

- [ ] **Step 1: Единая проверка лимита.** Хелпер в `src/lib/premium.ts`:

```ts
// единый лимит поездок free-тарифа (аудит: 2 из 4 путей создания не проверяли)
export async function assertCanCreateTrip(ownerId: string) {
  const cfg = await getAppConfig();
  if (await isPremiumUserById(ownerId)) return;
  const count = await db.tripMember.count({ where: { userId: ownerId, role: "owner" } });
  if (count >= cfg.freeTripLimit) throw new Error("LIMIT_REACHED");
}
```

(сигнатуру согласовать с фактической `getPlanLimits`; если в проекте принят стиль возврата `Response|null` — вернуть его.) Вызвать в `trips` POST перед create, в `trip/import` внутри tx перед create; в `from-template` заменить хардкод `isPremium ? Infinity : 1` на `getPlanLimits`.
- [ ] **Step 2: Гейт self-upgrade.** В AppSettings флаг `selfUpgradeEnabled` (default **false** — demo-режим осознанно выключается перед публичным запуском; включается из админки, когда появится оплата). В `user/upgrade` первой проверкой: флаг выключен → 403 «Активация премиума временно недоступна». В `premium-modal.tsx` — обработка 403 с этим текстом. В `admin/settings` PUT/GET — поле флага (маска секрета не затрагивается).
- [ ] **Step 3: Заголовки.** В `next.config.ts`: `poweredByHeader: false`; HSTS — `includeSubDomains` (без preload — пока без полного домена-подтверждения); CSP не вводим (нет raw-HTML sink'ов — решение аудита).
- [ ] **Step 4: Проверка.** free-юзер: POST `/api/trips` ×3 → третий 403 «Лимит поездок»; POST `/api/trip/import` ×3 → аналогично (2/h не мешает); POST `/api/user/upgrade` → 403; `/api/limits` по-прежнему 403-ит на лимите. `bun run lint`.
- [ ] **Step 5: Commit** — `feat(plan): лимит поездок на всех путях создания, гейт self-upgrade, заголовки`.

### Task 12: Финальный прогон и доки

**Files:**
- Modify: `docs/api.md` (сводная таблица лимитов — сверить со всеми Task 1/7/8), `docs/architecture.md` (§4 WS eviction/ревокация, §5 settlementKey), `docs/glossary.md` (если появились новые термины), `worklog.md` (запись сессии)

- [ ] **Step 1: Смоук-прогон** ключевых проверок из задач 1–11 на dev-стеке (docker Postgres + `bun server.ts`), список — в `NEEDS-VALIDATION.md` (разделы Fix direction).
- [ ] **Step 2:** `bun run lint`; `bun run build` (прод-сборка должна собраться; на Windows — в Git Bash).
- [ ] **Step 3: worklog.md** — запись: аудит 2026-09-12 (run-1), 27 leads, этот план, ссылка на отчёт.
- [ ] **Step 4: Commit** — `docs: сводка лимитов и realtime-гарантий после security-hardening`.

---

## Отложено (осознанно, вне этого плана)

- Полноценный CSP (после появления внешних внедрений/виджетов), owners-only ban-list UI доработки, переезд на zod-схемы (масштабный рефактор валидации), полный SSRF-фильтр исходящих (DNS-resolver level), шифрование бэкапов, `bcrypt` cost 12.
- Решения владельца, отмеченные в аудите: ban-list видимость (Task 5 — выбран owner-only), totalBudget policy (Task 5 — выбран collaborative), self-upgrade (Task 11 — выключен до появления оплаты).
