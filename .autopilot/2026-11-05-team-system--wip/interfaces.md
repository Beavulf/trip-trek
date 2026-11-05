# Границы, решённые в спецификации

Проект: «Система-команда для TripTrek» — живёт в `team/` внутри репозитория.

## Правила проекта

- Исходные правила репозитория из `AGENTS.md` (файл владельца — не трогаем): доки обновляются тем же коммитом, комментарии по-русски, «почему», а не «что».
- `team/` — единственное место, где правятся роли и регламенты. Сгенерированные платформенные файлы руками не правятся.
- Прод — только чтение (SSH-алиас `triptrek`). Любая запись/изменение на проде — стоп и отдельный явный запрос владельца.
- Секретов в `team/` нет: ни ключей, ни паролей, ни hostnames сверх уже публичных в репо (домен, алиас `triptrek`).
- Наружу (посты, ответы пользователям, письма) система не отправляет ничего — только черновики файлами.
- Сырые выгрузки отзывов не коммитятся: `team/inbox/feedback/raw/` — в `.gitignore`.

## Структура `team/`

```
team/
├── README.md            — точка входа: как работать с командой, пример диалога
├── lifecycle.md         — этапы конвейера, ворота одобрения, точки вопросов владельцу
├── roles/               — источник истины ролей: strategist, architect, engineer,
│                          reviewer, growth, support (по одному .md с YAML-frontmatter)
├── policies/
│   ├── data-access.md       — политика доступа к данным (из v1, обновлённая)
│   └── prod-readonly.md     — read-only доступ к продy (из v1, алиас triptrek)
├── templates/           — idea-brief, spec, ticket, release, feedback-analysis
├── inbox/               — результаты джобов и разборы: ideas/, feedback/, audit/, content/
└── jobs/
    ├── README.md            — runbook джоб: расписание, что делают, как включить/изменить
    ├── fetch-feedback.mjs   — дайджест отзывов из прода (read-only)
    └── audit-checklist.md   — чек-лист еженедельного аудита слабых мест
```

## Форматы ролей (источник → платформы)

Источник `team/roles/<role>.md`: YAML-frontmatter `{name, description, tools}` + тело-промпт.
`team/sync.mjs` (bun, без зависимостей) генерирует:

| Платформа | Путь | Frontmatter |
|---|---|---|
| Claude Code | `.claude/agents/triptrek-<role>.md` | `{name: triptrek-<role>, description, tools: Read, Grep, Glob}` — строкой через запятую |
| Copilot | `.github/agents/triptrek-<role>.agent.md` | `{name: "TripTrek <Title>", description, tools: [read, search], user-invocable: true}` |
| Kimi | `.agents/skills/triptrek-<role>/SKILL.md` | `{name: triptrek-<role>, description}` |

- Имена ролей (латиница, фиксированы): `strategist`, `architect`, `engineer`, `reviewer`, `growth`, `support`.
- `bun team/sync.mjs` — перезаписать сгенерированное; `bun team/sync.mjs --check` — exit 1 при расхождении (для аудита).
- Контракт sync: вход только `team/roles/*.md`; шаблоны обёрток (заголовки «что читать первым») живут внутри sync.mjs.

## Контракт `team/jobs/fetch-feedback.mjs`

- Запуск: `bun team/jobs/fetch-feedback.mjs [--since YYYY-MM-DD]` (по умолчанию — последние 26 часов).
- Ходит: `ssh triptrek "docker exec triptrek-db psql -U triptrek -d triptrek …"` — один SELECT по `"Feedback"` (+ JOIN `"User"` только ради отображаемого имени) в транзакции `READ ONLY`. Запросы зашиты в коде; новые выборки — правкой кода, не параметром.
- Выход: `team/inbox/feedback/YYYY-MM-DD.md` — человекочитаемый дайджест (id, тип, статус, дата, текст, контакт); сырой JSON — в `team/inbox/feedback/raw/` (игнорируется git). Новых отзывов нет — файла нет, exit 0, stdout «новых отзывов нет».
- Сбой SSH/SQL — сообщение в stderr, exit 1; никаких ретраев в обход.
- Обезличивание: email/имена попадают только в raw и только при наличии; в дайджест — как есть в отзыве, без домыслов.

## Швы для проверки

- `bun team/sync.mjs --check` после генерации — зелёный.
- `bun team/jobs/fetch-feedback.mjs` — ручной прогон настоящего чтения (read-only, на это есть слово владельца).
- Markdown-файлы ролей парсятся sync без ошибок (frontmatter валиден) — покрыто `--check`.

## Команды (для этого прогона)

- Проверка системы: `bun team/sync.mjs --check`
- Ручной дайджест: `bun team/jobs/fetch-feedback.mjs`
- Существующие проверки продукта (`bun run lint`, `bun run test`) наш код не затрагивает — зона прогона вне `src/`; гонять их не нужно, ломать их нельзя.

## Что не трогать

- `src/`, `prisma/`, `server/`, `docker-deploy/` — продуктовый код и инфраструктура; этот прогон их не меняет (кроме `.gitignore` — одна строка про raw-выгрузки).
- `AGENTS.md`, `CLAUDE.md` — файлы владельца: не пишем, в конце предложим дополнение.
- `.autopilot/`, `docs/archive/ai-team-v1/` — зона оркестратора и архив.

## Построено готовыми тасками

- **T01** — `team/`: README.md, lifecycle.md, strategy.md (каркас для роли growth); роли `team/roles/<role>.md` с frontmatter `{name: triptrek-<role>, description, tools: "Read, Grep, Glob"}`; шаблоны `team/templates/{idea-brief,spec,ticket,release,feedback-analysis}.md`; политики `team/policies/{data-access,prod-readonly}.md`; ADR `docs/adr/0013-team-system.md`; v1 — в `docs/archive/ai-team-v1/`. Роли ссылаются на `team/jobs/{fetch-feedback.mjs,audit-checklist.md,README.md}` и `team/inbox/{ideas,feedback,audit,content}/` — эти пути обязан создать T03.
