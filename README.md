# TripTrek

Веб-приложение для совместного планирования путешествий: маршрут по дням с картой,
бюджет с автоматическим расчётом долгов, галерея, дневник, чат, гастрогид,
разговорник. PWA с realtime-обновлениями (socket.io) и web-push уведомлениями.
ИИ-фичи (подбор мест, итоги поездки, разговорник, блюда города) работают по схеме
BYOK — каждый участник может подключить свой LLM-ключ.

## Стек

Next.js 16 (App Router, SPA) · React 19 · TypeScript · Tailwind 4 + shadcn/ui ·
TanStack Query · Zustand · Leaflet · Prisma + PostgreSQL · socket.io · **Bun**
(кастомный `server.ts`: Next HTTP + WS + `/uploads` в одном процессе).

## Быстрый старт (dev)

Нужны [Bun](https://bun.sh) и Docker.

```bash
bun install
bun run db:up          # Postgres в docker (docker-compose.dev.yml)
bun run db:migrate     # миграции
bun run db:seed        # демо-данные (поездка «Китай»)
bun server.ts          # dev-сервер целиком (Next + WS + uploads) на :3000
```

В корне нужен `.env`:

```
DATABASE_URL=postgresql://postgres:dev@localhost:5432/triptrek?schema=public
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
```

Тестовые аккаунты после сида: `you@` / `leha@` / `den@triptrek.com`, пароль `1234`.

Юнит-тесты: `bun run test` · линтер: `bun run lint`.

## Документация

- [AGENTS.md](AGENTS.md) — точка входа: карта репозитория, паттерны и грабли проекта (полезно не только агентам)
- [docs/architecture.md](docs/architecture.md) — как всё устроено и почему так
- [docs/api.md](docs/api.md) — карта API-роутов, лимиты, realtime-события
- [docs/glossary.md](docs/glossary.md) — термины и фичи главного экрана
- [docs/adr/](docs/adr/) — архитектурные решения (ADR)
- [worklog.md](worklog.md) — журнал сессий разработки: что и зачем менялось
- [docker-deploy/DEPLOY.md](docker-deploy/DEPLOY.md) — прод: деплой на VPS, env, бэкапы, диагностика
