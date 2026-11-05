# Инвентарь репозитория для «системы-команды» (Autopilot, 2026-11-05)

Репозиторий: `C:\PROJECTS\trip-trek`. Точка входа для любого агента — `AGENTS.md`
(карта кода, рецепты, правила обновления доков). v1 «AI team» живёт в коммите e8600df
и описанных ниже путях.

## 1. Инвентарь v1 «AI team»

- `.claude/agents/` — 5 ролей, простые Markdown с YAML-frontmatter `{name, description, tools}`:
  `triptrek-architect.md` (`tools: Read, Grep, Glob`), `triptrek-product.md`, `triptrek-engineer.md`,
  `triptrek-reviewer.md`, `triptrek-growth.md`. Тело — короткая инструкция «что читать и что делать»,
  отсылает к `AGENTS.md` и `docs/ai-team/roles.md`.
- `.github/agents/` — те же 5 ролей как `*.agent.md` (Copilot): frontmatter
  `{name: "TripTrek Solution Architect", description, tools: [read, search], user-invocable: true}`;
  тело текстуально совпадает с `.claude`-версией. То есть синк ролей = копия тела + иной frontmatter.
- `.claude/skills/triptrek-team/SKILL.md` — оркестратор полного цикла (10 шагов, обязательный
  стоп-гейт на одобрении, запреты прод-операций); frontmatter: `name`, `description`, `argument-hint`,
  `disable-model-invocation: true`. Шаблоны в `templates/`: `idea-brief.md` (Статус: idea),
  `spec.md` (Связанный бриф), `ticket.md` (Статус: ready), `release-growth.md`, `feedback-analysis.md`
  (Источник/период/ограничения выборки).
- `docs/ai-team/`:
  - `README.md` — таблица 5 ролей (Product Strategist, Solution Architect, Implementation Engineer,
    Quality Reviewer, Growth & Feedback Analyst) + координатор; жизненный цикл
    `idea → discovery → spec → plan → approved → implementation → review → accepted → release-ready → measured`;
    пределы автономности (никаких push/merge/deploy/рассылок без явного разрешения; субагенты не просыпаются сами).
  - `roles.md` — развёрнутые обязанности и запреты каждой роли. Ценно как источник промптов ролей v2.
  - `data-access.md` — политика доступа к данным: таблица источников, правила обезличивания, порядок
    подключения прод-аналитики (агрегаты, read-only роль БД, никаких секретов в чат/git). Обязательный
    гвард для будущих джобов.
  - `readonly-production-access.md` — план read-only доступа к прод-воронке; уже содержит рабочие решения:
    агрегатные SELECT в `READ ONLY` транзакциях, роль БД только на согласованные view, SSH-профиль без
    shell/sudo с local port-forward на `127.0.0.1:5433`, недостающая атрибуция (`utm_*`/`yclid` в схеме нет).
  - `briefs/2026-11-05-acquisition.md` — discovery-бриф «привлечение и активация» (Статус: discovery).
  - `specs/2026-11-05-acquisition-funnel.md` — спека измерения воронки; статус «реализация одобрена
    локально; production-миграция и деплой не одобрены». Ранняя активация = первое добавленное место.

## 2. Обратная связь (feedback)

- Prisma (`prisma/schema.prisma`): `model Feedback` (строка ~599) — `userId String?` (SetNull; null =
  гость), `type` (bug/idea/question/complaint/review), `message`, `screenshotUrl` (`/uploads/feedback/*.jpg`),
  `status` (new/in_progress/resolved), `adminNote`, устаревшие `adminReply`/`repliedAt` (не читаются),
  автоконтекст `pageUrl/screen/tripId/userAgent/viewport/appVersion`, `contactEmail` (только гости),
  `lastActivityAt`, `userSeenAt`, `createdAt/updatedAt/resolvedAt`; индексы `[status, lastActivityAt]`,
  `[userId]`; связи `user User?`, `messages FeedbackMessage[]`. `model FeedbackMessage` (~634) —
  `feedbackId`, `author` (user/admin), `authorId String?` (без FK), `body`, `createdAt`.
- Read-only выборка новых отзывов: таблица `"Feedback"` (`createdAt`, `lastActivityAt`, `type`, `status`,
  `message`); связь с пользователем — `userId` → `"User"` (JOIN по желанию; у гостей `contactEmail`).
  Для дайджеста достаточно `WHERE "createdAt" > :since ORDER BY "createdAt"` (или `lastActivityAt` для переписки).
- Чистая логика `src/lib/feedback.ts`: `FEEDBACK_TYPES`, `FEEDBACK_STATUSES`, `MAX_MESSAGE=4000`,
  `statusAfterMessage(author, current)` (юзер дописал → очередь админа), `QUICK_REPLIES`, тесты рядом
  `feedback.test.ts`. Серверное `src/lib/feedback-server.ts`: `notifyAdminsOfFeedback`, `buildThread`,
  `adminFeedbackUrl/userFeedbackUrl`.
- API: `src/app/api/feedback/route.ts` (POST multipart: message+type+контекст+скриншот; rate-limit
  5/час/юзер через `userRateLimit`), `src/app/api/feedback/[id]/`, `src/app/api/feedback/guest/`,
  `src/app/api/feedback/mine/`, админка — `src/app/api/admin/feedback/route.ts` + `[id]/`.
  Интеграционный тест: `src/app/api/feedback/feedback-api.integration.test.ts`.
- Админский UI: `src/components/admin/FeedbackTab.tsx` (список с бесконечной прокруткой, поиск,
  фильтры по `FeedbackStatus/FeedbackType`) и `FeedbackDetail.tsx` (переписка, ответы, заметки).

## 3. Прод-доступ (по `docker-deploy/`)

- `docker-compose.yml`: сервисы `db` (postgres:16-alpine, контейнер `triptrek-db`, user/db `triptrek`,
  том `triptrek-pgdata`, порт наружу НЕ публикуется), `app` (`triptrek-app`, том `triptrek-uploads`),
  `caddy` (`triptrek-caddy`, 80/443). App дополнительно в общей сети `caddy-shared` (`supabase-network`,
  external) — TLS обслуживает общий Caddy guild-ledger (`/root/guild-ledger/Caddyfile`).
- Read-only до Postgres: `ssh triptrek` → `docker exec triptrek-db psql -U triptrek -d triptrek` с
  `BEGIN TRANSACTION READ ONLY` / `SET TRANSACTION READ ONLY`. Туннель 5433 пока не настроен.
- Бэкапы: `docker-deploy/backup.sh` (cron на хосте `0 4 * * *`): `pg_dump` через
  `docker exec triptrek-db` + tar тома uploads → `/var/backups/triptrek/` (7 дней) и rclone remote
  `triptrek-backup` (30 дней). Лог: `/var/log/triptrek-backup.log`.
- Наблюдаемость: `docker compose logs app` (JSON), `docker compose ps` (healthchecks),
  `GET /api/health`. Режим техработ — `server/maintenance-gate.ts`, выключается UPDATE в `AppSettings`.
- Домен/секреты в `.env` на сервере; в репо секретов нет.

## 4. Конвенции доков

- ADR (`docs/adr/0001`…`0012`): `# ADR-NNNN: <название>`, строка `Статус: принято · <дата>`, разделы
  `## Контекст` / `## Решение` / `## Последствия` (включая «Отвергнуто»). Новый ADR — до кода (AGENTS.md).
- `docs/glossary.md`: «Фичи главного экрана (табы SPA)», «Сочтёмся», «Доменные сущности»,
  «Пользователи, планы, ИИ», «Инфраструктура и рантайм».
- `docs/architecture.md`: 1 Общая схема, 2 Frontend, 3 API-роуты, 4 Realtime, 5 Модель данных,
  6 Файлы и фото, 7 Сессии/аккаунты/почта, 8 ИИ и монетизация, 9 Уведомления, 10 Деплой.
- `worklog.md` — журнал сессий («## Session <дата> — <тема>»: Запрос / Сделано); история «почему меняли».
- `PATCHNOTES.md` — релизные заметки по версиям (`## v0.2.16 — …`); `SUMMARY-OF-FIXES.md` — историческая сводка.

## 5. Форматы агентов

- `.claude/agents/triptrek-architect.md`: frontmatter `name: triptrek-architect`,
  `description: "…"`, `tools: Read, Grep, Glob` — дальше свободный Markdown-промпт.
- `.github/agents/triptrek-architect.agent.md`: `name: TripTrek Solution Architect`,
  `description`, `tools: [read, search]`, `user-invocable: true`; тело идентично claude-версии.
- Каталогов `.agents/` и `.kimi/` в репо НЕТ — место для Kimi-ролей нужно выбрать и зафиксировать
  (кандидаты: `.kimi/agents/` по аналогии с `.claude/agents/`).

## 6. Точки интеграции для джобов

- `src/lib/metrika.ts` — только клиентская отправка целей (`reachGoal(goal, done?, params?)`,
  ждёт callback счётчика ≤500 мс, `window.ymCounterId` ставит серверный `YandexMetrika`).
  Выгрузки/Logs API нет. Цели в коде: `signup` (login-form), `tour_start`, `app_install_tap`,
  `app_installed`, `trip_created` (`src/lib/trip-analytics.ts`, param `creation_method`).
  Счётчик включается env `NEXT_PUBLIC_YANDEX_METRIKA_ID` (рантайм, без пересборки).
- `scripts/`: `admin-smoke.mjs` (смоук админки и баг-репортов против dev `:3100`),
  `test-debt-logic.mjs` (одноразовый тест долгов). Скриптов аналитики нет.
- `tool-results/` — сохранённые выводы чтений (`read_*.txt` — дампы файлов с номерами строк).
- `.tmp-analytics/` (untracked): `dump.sql`, `prod-data.json`, `analysis.json`, `analyze.js`,
  `build.js`, `serve.js`, `template.html` — следы одноразовой агрегатной проверки 05.11.2026
  (см. `docs/ai-team/readonly-production-access.md`). Переиспользовать с осторожностью: подходит
  как заготовка джобы дайджеста, но данные обезличивать до передачи.
- SSH-алиас `triptrek` настроен (в v1-доках фигурировал алиас `prod` — расхождение учесть в джобах).
