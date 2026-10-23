# Бета-запуск TripTrek — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Контролируемый публичный доступ в бету: инвайт-коды на регистрацию, страница-презентация `/landing`, метрика и контакт для связи.

**Architecture:** Новая модель `InviteCode` + флаг `inviteRequired` в `AppSettings`; слот кода занимается атомарным условным `updateMany` в существующем `POST /api/auth/register`. Лендинг — отдельная публичная server-страница `/landing` (презентация для ссылки из TikTok); корень и middleware не трогаем — гость на `/` по-прежнему уходит на `/login`. Витринные данные (демо-поездка, телеграм) редактируются в админке через `AppSettings`.

**Tech Stack:** Next.js 16 App Router (custom `server.ts` под Bun), Prisma 6 + PostgreSQL, TanStack Query 5, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-beta-launch-design.md`. Одно осознанное расширение спеки: `GET /api/auth/register-options` возвращает и `contactTelegram` (он и так публичен на лендинге) — чтобы футер `/login` обошёлся без второго эндпоинта.

## Global Constraints

- Рантайм — **Bun**, не Node (`bun server.ts` для ручной проверки).
- Комментарии в коде — **по-русски**, объясняют «почему», а не «что».
- Все мутационные `/api/admin/*` — через `requireAdmin`; публичные GET — rate limit из `src/lib/rate-limit.ts`.
- Клиентские фичи поездок не ходят в fetch мимо хуков; админ-табы — прямой fetch + TanStack Query (существующий паттерн `SettingsTab`).
- Документация обновляется **тем же коммитом**, что и изменение (см. §«Поддержание документации» в `AGENTS.md`).
- `bun run lint` — 0 ошибок; `bun run test` — зелёный; перед финалом — `bun run build`.
- Стиль коммитов как в репозитории: `feat(scope): суть по-русски`.

---

### Task 1: `src/lib/invite-code.ts` — чистые функции кодов

**Files:**
- Create: `src/lib/invite-code.ts`
- Test: `src/lib/invite-code.test.ts`

**Interfaces:**
- Consumes: ничего (только `node:crypto`).
- Produces (используют Tasks 4, 6, 7):
  - `generateInviteCode(length?: number): string` — код из алфавита без похожих символов;
  - `normalizeInviteCode(raw: string): string` — `trim().toUpperCase()`;
  - `inviteCodeStatus(code: { maxUses: number; usedCount: number; expiresAt: Date | null; deactivatedAt: Date | null }, now?: Date): InviteStatus` — `"active" | "expired" | "deactivated" | "exhausted"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/invite-code.test.ts
import { describe, expect, it } from "vitest";
import { generateInviteCode, inviteCodeStatus, normalizeInviteCode } from "./invite-code";

// Алфавит без похожих символов (нет I/O/0/1) — код читают с экрана и диктуют голосом
const ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

describe("generateInviteCode", () => {
  it("длина по умолчанию 8, только алфавит без похожих символов", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(ALPHABET);
    }
  });
  it("коды не повторяются", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(codes.size).toBe(200);
  });
});

describe("normalizeInviteCode", () => {
  it("обрезает пробелы и поднимает регистр — как инвайт-коды поездок", () => {
    expect(normalizeInviteCode("  abcd2345 ")).toBe("ABCD2345");
  });
});

describe("inviteCodeStatus", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const base = { maxUses: 1, usedCount: 0, expiresAt: null, deactivatedAt: null };

  it("active — живой код со свободным слотом", () => {
    expect(inviteCodeStatus(base, now)).toBe("active");
  });
  it("deactivated — выключенный админом, даже если всё остальное ок", () => {
    expect(inviteCodeStatus({ ...base, deactivatedAt: now }, now)).toBe("deactivated");
  });
  it("expired — срок вышел", () => {
    expect(inviteCodeStatus({ ...base, expiresAt: new Date("2026-10-23T11:59:59Z") }, now)).toBe("expired");
  });
  it("exhausted — слоты кончились", () => {
    expect(inviteCodeStatus({ ...base, usedCount: 1, maxUses: 1 }, now)).toBe("exhausted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/lib/invite-code.test.ts`
Expected: FAIL — не удаётся импортировать `./invite-code`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/invite-code.ts
import { randomInt } from "node:crypto";

// Инвайт-коды приложения (бета-доступ): чистые функции. Занятие слота — атомарный
// updateMany в роуте регистрации; здесь только генерация, нормализация и статус
// для отображения в админке.

// Алфавит без похожих символов (нет I/O/0/1) — код читают с экрана и диктуют голосом
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

// Ввод нормализуем так же, как инвайт-коды поездок: регистр и пробелы не мешают
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export type InviteStatus = "active" | "expired" | "deactivated" | "exhausted";

/** Статус для списка в админке; решение «можно ли занять слот» принимает updateMany в БД */
export function inviteCodeStatus(
  code: { maxUses: number; usedCount: number; expiresAt: Date | null; deactivatedAt: Date | null },
  now = new Date()
): InviteStatus {
  if (code.deactivatedAt) return "deactivated";
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return "expired";
  if (code.usedCount >= code.maxUses) return "exhausted";
  return "active";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/lib/invite-code.test.ts`
Expected: PASS, все тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invite-code.ts src/lib/invite-code.test.ts
git commit -m "feat(beta): чистые функции инвайт-кодов приложения"
```

---

### Task 2: Prisma — модель InviteCode и поля AppSettings

**Files:**
- Modify: `prisma/schema.prisma` (User после строки `onboardingCompletedAt DateTime?` в полях и в списке связей; новый `InviteCode` после модели `PasswordResetToken`; `AppSettings` — три поля в конец модели)

**Interfaces:**
- Produces: `db.inviteCode` (Prisma client), поля `User.inviteCodeId`, `AppSettings.inviteRequired / demoTripToken / contactTelegram` — используются Tasks 4–8.

- [ ] **Step 1: Поднять dev-базу, если не запущена**

Run: `docker compose -f docker-compose.dev.yml up -d` (или `bun run db:up`), дождаться готовности.

- [ ] **Step 2: Правка schema.prisma**

В модель `User` (после поля `onboardingCompletedAt`, перед `createdAt`):

```prisma
  // Какой инвайт-код приложения привёл юзера в бету. SetNull: коды только
  // деактивируются, но если код однажды удалят — юзер не должен сломаться
  inviteCodeId String?
```

В список связей `User` (после `aiUsage       AiUsage[]`):

```prisma
  inviteCode    InviteCode?  @relation("inviteCode", fields: [inviteCodeId], references: [id], onDelete: SetNull)
```

Новая модель после `PasswordResetToken`:

```prisma
// === Инвайт-коды приложения (бета-доступ). Отдельны от инвайт-кодов поездок
// (Trip.inviteCode): этот код проверяется на регистрации АККАУНТА, а не входа в
// поездку. usedCount — авторитетный счётчик: слот занимает атомарный условный
// updateMany в api/auth/register; связь users — только справка «кто пришёл»
model InviteCode {
  id            String    @id @default(cuid())
  code          String    @unique
  note          String? // «тикток-видео», «для Лехи» — только для админа
  maxUses       Int       @default(1)
  usedCount     Int       @default(0)
  expiresAt     DateTime?
  deactivatedAt DateTime?
  createdAt     DateTime  @default(now())
  // userId админа, создавшего код, без FK: юзера могут удалить, код остаётся
  createdBy     String

  users User[] @relation("inviteCode")
}
```

В модель `AppSettings` (в конец, перед закрывающей скобкой):

```prisma
  // Бета-гейты и витрина лендинга. inviteRequired: при включённой регистрации
  // требовать инвайт-код приложения (api/auth/register)
  inviteRequired  Boolean @default(false)
  demoTripToken   String? // токен публичной поездки для «Живого примера» на лендинге
  contactTelegram String? // «@name» или https-ссылка — футер лендинга и /login
```

- [ ] **Step 3: Миграция**

Run: `bun run db:migrate --name beta_invite_codes`
Expected: создана папка `prisma/migrations/<timestamp>_beta_invite_codes/` с `CREATE TABLE "InviteCode"` и тремя `ALTER TABLE` (users, AppSettings); клиент перегенерирован.

- [ ] **Step 4: Проверка**

Run: `bun run db:generate && bunx tsc --noEmit 2>&1 | head -5`
Expected: генерация без ошибок; tsc не выдаёт новых ошибок, связанных с `inviteCode`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(beta): модель InviteCode и бета-поля AppSettings"
```

---

### Task 3: `app-config.ts` — inviteRequired и публичная витрина

**Files:**
- Modify: `src/lib/app-config.ts`

**Interfaces:**
- Consumes: `db` (как в файле), поля из Task 2.
- Produces (используют Tasks 4, 5, 8, 10):
  - `AppConfig` получает поле `inviteRequired: boolean`;
  - `getPublicShowcase(): Promise<PublicShowcase>`, где `PublicShowcase = { registrationEnabled: boolean; inviteRequired: boolean; demoTripToken: string | null; contactTelegram: string | null }`.

- [ ] **Step 1: Расширить AppConfig и дефолты**

В `interface AppConfig` добавить строку:

```ts
  /** Регистрация по инвайт-кодам приложения (бета-гейт). */
  inviteRequired: boolean;
```

В `DEFAULTS` добавить `inviteRequired: false,`.

В `getAppConfig()` в `select` добавить `inviteRequired: true,` и в сборку результата `inviteRequired: row.inviteRequired ?? DEFAULTS.inviteRequired,`.

- [ ] **Step 2: Добавить getPublicShowcase (в конец файла)**

```ts
/** Публичная витрина (лендинг, /login): что гостю можно знать о режиме приложения. */
export interface PublicShowcase {
  registrationEnabled: boolean;
  inviteRequired: boolean;
  demoTripToken: string | null;
  contactTelegram: string | null;
}

export async function getPublicShowcase(): Promise<PublicShowcase> {
  const cfg = await getAppConfig();
  // Витринные поля лежат рядом в AppSettings, но в AppConfig не нужны:
  // они про «что показать гостю», а не про правила приложения
  const row = await db.appSettings.findUnique({
    where: { id: "app" },
    select: { demoTripToken: true, contactTelegram: true },
  });
  return {
    registrationEnabled: cfg.registrationEnabled,
    inviteRequired: cfg.inviteRequired,
    demoTripToken: row?.demoTripToken?.trim() || null,
    contactTelegram: row?.contactTelegram?.trim() || null,
  };
}
```

- [ ] **Step 3: Проверка**

Run: `bun run test && bunx tsc --noEmit 2>&1 | head -5`
Expected: тесты зелёные, новых ошибок tsc нет.

- [ ] **Step 4: Commit**

```bash
git add src/lib/app-config.ts
git commit -m "feat(beta): inviteRequired в конфиге и публичная витрина приложения"
```

---

### Task 4: Регистрация — занятие слота инвайт-кода

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Docs: `docs/api.md` (строка POST `/api/auth/register`)

**Interfaces:**
- Consumes: `normalizeInviteCode` (Task 1), `getAppConfig().inviteRequired` (Task 3), `db.inviteCode` (Task 2).
- Produces: `POST /api/auth/register` принимает опциональное поле `inviteCode` (string); при `inviteRequired` без валидного кода — 400 «Код недействителен или все места по нему заняты» / 400 «Введите инвайт-код».

- [ ] **Step 1: Импорты — добавить в существующий блок**

```ts
import { normalizeInviteCode } from "@/lib/invite-code";
```

- [ ] **Step 2: Расширить чтение конфига**

Заменить:

```ts
    const { registrationEnabled } = await getAppConfig();
```

на:

```ts
    const { registrationEnabled, inviteRequired } = await getAppConfig();
```

- [ ] **Step 3: Принять inviteCode из body**

Заменить:

```ts
    const { email, password, name } = (await req.json().catch(() => null)) ?? {};
```

на:

```ts
    const { email, password, name, inviteCode } = (await req.json().catch(() => null)) ?? {};
```

- [ ] **Step 4: Занять слот и создать юзера одной транзакцией**

Заменить:

```ts
    const hashedPassword = await hashPassword(password);
    const displayName = name.trim();
    const user = await db.user.create({
      data: { name: displayName, email: emailNorm, password: hashedPassword },
    });
```

на:

```ts
    const hashedPassword = await hashPassword(password);
    const displayName = name.trim();

    // Слот инвайт-кода занимается атомарным условным updateMany: условие
    // перепроверяется в SQL, поэтому две регистрации на последнем слоте не
    // пройдут обе (count-then-create чужую незакоммиченную вставку не видит).
    // Транзакция нужна, чтобы провал create (например, дубликат email) не
    // оставил занятый слот без юзера.
    const INVITE_GONE = new Error("invite-gone");
    let user;
    if (inviteRequired) {
      const code = typeof inviteCode === "string" ? normalizeInviteCode(inviteCode) : "";
      if (!code) {
        return NextResponse.json({ error: "Введите инвайт-код" }, { status: 400 });
      }
      const codeRow = await db.inviteCode.findUnique({ where: { code } });
      if (!codeRow) {
        return NextResponse.json({ error: "Код недействителен или все места по нему заняты" }, { status: 400 });
      }
      try {
        user = await db.$transaction(async (tx) => {
          const taken = await tx.inviteCode.updateMany({
            where: {
              id: codeRow.id,
              deactivatedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              usedCount: { lt: codeRow.maxUses },
            },
            data: { usedCount: { increment: 1 } },
          });
          if (taken.count === 0) throw INVITE_GONE;
          return tx.user.create({
            data: { name: displayName, email: emailNorm, password: hashedPassword, inviteCodeId: codeRow.id },
          });
        });
      } catch (e) {
        if (e === INVITE_GONE) {
          return NextResponse.json({ error: "Код недействителен или все места по нему заняты" }, { status: 400 });
        }
        throw e;
      }
    } else {
      // Код не обязателен: переданное поле игнорируем, инвайт-привязку не пишем
      user = await db.user.create({
        data: { name: displayName, email: emailNorm, password: hashedPassword },
      });
    }
```

- [ ] **Step 5: Обновить docs/api.md**

В таблице роутов у `POST /api/auth/register` дополнить описание: «при `inviteRequired` требует инвайт-код приложения (`InviteCode`, слот атомарный)»; в сводке «Rate limits» строка уже есть (register 3/ч/IP) — не трогать.

- [ ] **Step 6: Проверка вручную (dev-сервер)**

Run: `bun server.ts` в фоне; затем:
```bash
curl -s -X POST localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"probe1@test.dev","password":"abcdefg1","name":"Проба"}' && echo
```
Ожидаемо сейчас (inviteRequired=false): 200. Переключение флага проверяется в Task 8 (когда появится тумблер) и в финальном смоуке.

Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/auth/register/route.ts docs/api.md
git commit -m "feat(beta): регистрация требует инвайт-код при inviteRequired — атомарный слот"
```

---

### Task 5: GET /api/auth/register-options

**Files:**
- Create: `src/app/api/auth/register-options/route.ts`
- Docs: `docs/api.md`

**Interfaces:**
- Consumes: `getPublicShowcase()` (Task 3), `rateLimitMiddleware` (существующий).
- Produces: публичный GET → `{ registrationEnabled: boolean; inviteRequired: boolean; contactTelegram: string | null }`. Используется Task 9 (форма `/login`).

- [ ] **Step 1: Создать роут**

```ts
import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { getPublicShowcase } from "@/lib/app-config";

// GET /api/auth/register-options — публичный режим регистрации для формы /login.
// 60/мин/IP: страница логина дёргает его на каждом заходе (в отличие от самой
// регистрации, где 3/ч/IP). contactTelegram здесь же — футер «застряли? напишите»
export async function GET(req: NextRequest) {
  const rateLimit = rateLimitMiddleware(req, "register-options", 60, 60_000);
  if (rateLimit) return rateLimit;

  const showcase = await getPublicShowcase();
  return NextResponse.json({
    registrationEnabled: showcase.registrationEnabled,
    inviteRequired: showcase.inviteRequired,
    contactTelegram: showcase.contactTelegram,
  });
}
```

- [ ] **Step 2: Обновить docs/api.md**

Добавить строку: `GET /api/auth/register-options` — «публично; режим регистрации + контакт для связи; 60/мин/IP» и дополнить сводку «Rate limits» этим лимитом.

- [ ] **Step 3: Проверка**

Run: `curl -s localhost:3000/api/auth/register-options` (dev-сервер из Task 4 ещё поднят)
Expected: `{"registrationEnabled":true,"inviteRequired":false,"contactTelegram":null}`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/register-options/route.ts docs/api.md
git commit -m "feat(beta): публичный register-options для формы входа"
```

---

### Task 6: Admin API инвайт-кодов + журнал

**Files:**
- Modify: `src/lib/admin-log.ts`
- Create: `src/app/api/admin/invites/route.ts`
- Create: `src/app/api/admin/invites/[id]/route.ts`
- Docs: `docs/api.md`

**Interfaces:**
- Consumes: `requireAdmin`, `logAdmin`, `generateInviteCode` (Task 1).
- Produces (использует Task 7):
  - `GET /api/admin/invites` → `{ codes: InviteRow[] }`;
  - `POST /api/admin/invites` `{ count, maxUses, expiresAt?, note? }` → `{ codes: string[] }`;
  - `PATCH /api/admin/invites/[id]` `{ deactivatedAt: boolean }` (true = выключить, false = включить) → `{ code: InviteRow }`;
  - в `AdminAction` добавлены `"invite.create" | "invite.deactivate"`, в `AdminLogTarget` — `"invite"`.

- [ ] **Step 1: admin-log.ts — новые действия**

В `AdminAction` (после `"trip.transfer"`) добавить:

```ts
  | "invite.create"
  | "invite.deactivate"
```

В `AdminLogTarget` заменить type-union:

```ts
  type: "user" | "trip" | "feedback" | "settings" | "storage" | "invite";
```

- [ ] **Step 2: GET + POST /api/admin/invites**

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { generateInviteCode } from "@/lib/invite-code";

// Инвайт-коды приложения (бета-доступ). Удаления кодов нет — только деактивация:
// на код смотрят регистрации, и связь User.inviteCodeId (SetNull) не должна
// оказываться в подвешенном состоянии из панели

// GET /api/admin/invites — список кодов, новые сверху
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const codes = await db.inviteCode.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({ codes });
}

// POST /api/admin/invites — сгенерировать пачку: { count ≤ 100, maxUses ≤ 1000, expiresAt?, note? }
export async function POST(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const count = Number(body.count);
  const maxUses = Number(body.maxUses ?? 1);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 100) : null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return NextResponse.json({ error: "count: целое 1–100" }, { status: 400 });
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
    return NextResponse.json({ error: "maxUses: целое 1–1000" }, { status: 400 });
  }
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now())) {
    return NextResponse.json({ error: "expiresAt: дата в будущем" }, { status: 400 });
  }

  // Коллизия случайного 8-символьного кода практически исключена, но уникальный
  // индекс никто не отменял — пару перегенераций оставляем
  const created: string[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      const exists = await db.inviteCode.findUnique({ where: { code }, select: { id: true } });
      if (exists) continue;
      await db.inviteCode.create({ data: { code, note, maxUses, expiresAt, createdBy: admin!.id } });
      created.push(code);
      break;
    }
  }

  await logAdmin(admin!.id, "invite.create", { type: "invite", label: note ?? "коды" }, {
    count: created.length,
    maxUses,
    expiresAt: expiresAt?.toISOString() ?? null,
  });

  return NextResponse.json({ codes: created });
}
```

- [ ] **Step 3: PATCH /api/admin/invites/[id]**

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";

// PATCH /api/admin/invites/[id] — вкл/выкл кода: { deactivatedAt: boolean }
// (дату сервер ставит сам — клиент передаёт только факт выключения)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.deactivatedAt !== "boolean") {
    return NextResponse.json({ error: "deactivatedAt: boolean (выключить/включить)" }, { status: 400 });
  }

  const code = await db.inviteCode.update({
    where: { id },
    data: { deactivatedAt: body.deactivatedAt ? new Date() : null },
  });

  await logAdmin(admin!.id, "invite.deactivate", { type: "invite", id, label: code.code }, {
    deactivated: Boolean(code.deactivatedAt),
  });

  return NextResponse.json({ code });
}
```

- [ ] **Step 4: Обновить docs/api.md**

Три строки в таблице (`/api/admin/invites` GET/POST, PATCH `/api/admin/invites/[id]`) — гард `requireAdmin`, действия пишутся в AdminLog.

- [ ] **Step 5: Проверка вручную**

Через UI ещё нет — проверить curl'ом с админской сессией (cookie из браузера):
```bash
curl -s -X POST localhost:3000/api/admin/invites -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<cookie>" -d '{"count":2,"maxUses":3,"note":"тест"}'
```
Expected: `{"codes":["XXXXXXXX",…]}`; повторный вызов GET показывает коды; не-админ получает 403.

Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-log.ts src/app/api/admin/invites docs/api.md
git commit -m "feat(beta): admin API инвайт-кодов — генерация пачки и деактивация"
```

---

### Task 7: Админка — вкладка «Инвайты»

**Files:**
- Modify: `src/components/admin/shell.tsx` (ADMIN_SECTIONS)
- Modify: `src/components/admin/shared.tsx` (SECTION_COLOR)
- Create: `src/components/admin/InvitesTab.tsx`
- Create: `src/app/admin/invites/page.tsx`

**Interfaces:**
- Consumes: API из Task 6; `statusMeta`-логика из `inviteCodeStatus` локально дублировать не нужно — статус считается на клиенте из полей строки.
- Produces: вкладка `/admin/invites` в навигации.

- [ ] **Step 1: shell.tsx — раздел в навигации**

В импорты lucide-react добавить `Ticket`. В `ADMIN_SECTIONS` после строки «Поездки» вставить:

```ts
  { href: "/admin/invites", label: "Инвайты", icon: Ticket, key: "invites" },
```

- [ ] **Step 2: shared.tsx — цвет секции**

В `SECTION_COLOR` (порядок ключей повторяет навигацию) после `trips:` добавить:

```ts
  invites: "#14b8a6",
```

- [ ] **Step 3: InvitesTab.tsx**

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

// Инвайт-коды приложения: генерация пачки и слежение за активациями.
// Код проверяется на регистрации аккаунта (не на входе в поездку).

interface InviteRow {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
}

const inputCls =
  "w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile";

function statusMeta(row: InviteRow): { label: string; cls: string } {
  if (row.deactivatedAt) return { label: "Выключен", cls: "bg-muted text-muted-foreground" };
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now())
    return { label: "Истёк", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  if (row.usedCount >= row.maxUses)
    return { label: "Мест нет", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" };
  return { label: "Активен", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
}

export function InvitesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ codes: InviteRow[] }>({
    queryKey: ["admin-invites"],
    queryFn: async () => {
      const r = await fetch("/api/admin/invites");
      if (!r.ok) throw new Error("Не удалось загрузить коды");
      return r.json();
    },
  });

  const [count, setCount] = useState("10");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-invites"] });
    qc.invalidateQueries({ queryKey: ["admin-journal"] });
  };

  const generate = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: Number(count),
          maxUses: Number(maxUses),
          expiresAt: expiresAt || undefined,
          note: note || undefined,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b as { codes: string[] };
    },
    onSuccess: (b) => {
      invalidate();
      setNote("");
      toast.success(`Создано кодов: ${b.codes.length}`, {
        description: b.codes.join("  "),
        duration: 10000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (row: InviteRow) => {
      const r = await fetch(`/api/admin/invites/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivatedAt: !row.deactivatedAt }),
      });
      if (!r.ok) throw new Error(`Ошибка ${r.status}`);
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success(`Скопировано: ${code}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* === Генерация === */}
      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-teal-500" />
          <h2 className="font-semibold text-sm">Сгенерировать коды</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Сколько кодов (1–100)</span>
            <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Активаций на код (1–1000)</span>
            <input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Действует до (необязательно)</span>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Заметка (для себя)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="тикток-видео" className={inputCls} />
          </label>
        </div>
        <button
          type="button"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
          className="w-full min-h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
        >
          {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Создать коды
        </button>
        <p className="text-[10px] text-muted-foreground">
          Общий код на кампанию — например 1 код на 100 активаций. Персональные — 100 кодов по 1 активации.
        </p>
      </section>

      {/* === Список === */}
      <section className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {(data?.codes ?? []).map((row) => {
          const st = statusMeta(row);
          return (
            <div key={row.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => copy(row.code)}
                title="Скопировать код"
                className="font-mono font-bold text-sm tracking-wider hover:text-primary transition-colors inline-flex items-center gap-1.5"
              >
                {row.code}
                <Copy className="size-3 opacity-50" />
              </button>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", st.cls)}>{st.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {row.usedCount}/{row.maxUses}
              </span>
              <span className="text-xs text-muted-foreground truncate flex-1 min-w-0" title={row.note ?? undefined}>
                {row.note ?? ""}
                {row.expiresAt && ` · до ${new Date(row.expiresAt).toLocaleDateString("ru-RU")}`}
              </span>
              <Switch
                checked={!row.deactivatedAt}
                onCheckedChange={() => toggle.mutate(row)}
                disabled={toggle.isPending}
                aria-label="Код активен"
              />
            </div>
          );
        })}
        {(data?.codes ?? []).length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Кодов ещё нет — сгенерируйте первую партию выше.
          </p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Страница-обёртка (как у настроек)**

```tsx
// src/app/admin/invites/page.tsx
"use client";

import { InvitesTab } from "@/components/admin/InvitesTab";

export default function AdminInvitesPage() {
  return <InvitesTab />;
}
```

- [ ] **Step 5: Проверка**

Run: `bun server.ts`, открыть `/admin/invites` админом: создать 5 кодов по 2 активации, скопировать кликом, выключить один — статус «Выключен».
Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/shell.tsx src/components/admin/shared.tsx src/components/admin/InvitesTab.tsx src/app/admin/invites
git commit -m "feat(beta): вкладка «Инвайты» в админке — генерация и статусы кодов"
```

---

### Task 8: Настройки — inviteRequired, демо-поездка, телеграм

**Files:**
- Modify: `src/app/api/admin/settings/route.ts`
- Modify: `src/components/admin/SettingsTab.tsx`

**Interfaces:**
- Consumes: `getAppConfig().inviteRequired` (Task 3), поля схемы (Task 2).
- Produces: `GET /api/admin/settings` → `appConfig.inviteRequired` + top-level `demoTripToken: string` / `contactTelegram: string`; `PUT` принимает `appConfig.inviteRequired`, `demoTripToken`, `contactTelegram`. Этим пользуется Task 10 (лендинг читает `getPublicShowcase`, а не этот роут).

- [ ] **Step 1: GET роута настроек**

В `select` первого запроса добавить `demoTripToken: true, contactTelegram: true,` (рядом с `selfUpgradeEnabled`), а в ответ добавить:

```ts
    demoTripToken: settings?.demoTripToken ?? "",
    contactTelegram: settings?.contactTelegram ?? "",
```

(`appConfig` уже отдаёт `inviteRequired` — он приходит из `getAppConfig()` после Task 3.)

- [ ] **Step 2: PUT роута настроек**

В тип `appConfig` в деструктуризации body добавить `inviteRequired?: boolean;`, в `data`-тип — `inviteRequired?: boolean;` и `demoTripToken?: string | null; contactTelegram?: string | null;`. В обработку `appConfig` (после блока `registrationEnabled`) добавить:

```ts
    if (appConfig.inviteRequired !== undefined) {
      if (typeof appConfig.inviteRequired !== "boolean") {
        return NextResponse.json({ error: "inviteRequired: boolean" }, { status: 400 });
      }
      data.inviteRequired = appConfig.inviteRequired;
      appTouched = true;
    }
```

Рядом (до проверки `Object.keys(data).length`) добавить обработку витринных полей:

```ts
  // Витрина лендинга: не «правила приложения», поэтому не в appConfig, но лог тот же
  for (const field of ["demoTripToken", "contactTelegram"] as const) {
    const v = (body as Record<string, unknown>)[field];
    if (v !== undefined) {
      if (v !== null && typeof v !== "string") {
        return NextResponse.json({ error: `${field}: строка или null` }, { status: 400 });
      }
      const trimmed = typeof v === "string" ? v.trim().slice(0, 200) : "";
      data[field] = trimmed || null;
      appTouched = true;
    }
  }
```

В meta лога `settings.app` добавить `inviteRequired: settings.inviteRequired,`.

- [ ] **Step 3: SettingsTab — состояние**

В `interface SettingsData.appConfig` добавить `inviteRequired: boolean;`, в сам интерфейс — `demoTripToken: string; contactTelegram: string;`.

Рядом с остальными состояниями «Приложения»:

```ts
  const [inviteRequired, setInviteRequired] = useState(false);
  const [demoToken, setDemoToken] = useState("");
  const [contactTg, setContactTg] = useState("");
```

В `settingsKey` добавить `settings.appConfig.inviteRequired, settings.demoTripToken, settings.contactTelegram`; в блок синхронизации:

```ts
    setInviteRequired(settings.appConfig.inviteRequired);
    setDemoToken(settings.demoTripToken ?? "");
    setContactTg(settings.contactTelegram ?? "");
```

В `saveApp.mutationFn` в `appConfig` добавить `inviteRequired,`, а в тело PUT — `demoTripToken: demoToken, contactTelegram: contactTg,`.

В `appDirty` добавить `inviteRequired !== settings.appConfig.inviteRequired || demoToken !== (settings.demoTripToken ?? "") || contactTg !== (settings.contactTelegram ?? "")`.

- [ ] **Step 4: SettingsTab — UI в секции «Приложение»**

После переключателя «Регистрация открыта» добавить:

```tsx
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Регистрация по инвайт-кодам</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Новым аккаунтам нужен код со вкладки «Инвайты». Коды поездок это не затрагивает.
            </p>
          </div>
          <Switch checked={inviteRequired} onCheckedChange={setInviteRequired} aria-label="Регистрация по инвайт-кодам" />
        </div>
```

Перед кнопкой «Сохранить конфиг приложения»:

```tsx
        <label className="space-y-1 block">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Демо-поездка для лендинга (токен /p/…)</span>
          <input value={demoToken} onChange={(e) => setDemoToken(e.target.value)} placeholder="cxxxxxxxxxxxxxxxxx" className={inputCls} />
        </label>
        <label className="space-y-1 block">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Телеграм для связи (лендинг и вход)</span>
          <input value={contactTg} onChange={(e) => setContactTg(e.target.value)} placeholder="@username" className={inputCls} />
        </label>
```

- [ ] **Step 5: Проверка**

Открыть `/admin/settings`: включить «Регистрация по инвайт-кодам», сохранить. Теперь `curl -s localhost:3000/api/auth/register-options` → `"inviteRequired":true`, а регистрация без кода (curl из Task 4, новый email) → 400 «Введите инвайт-код»; с кодом из Task 7 → 200.

Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/settings/route.ts src/components/admin/SettingsTab.tsx
git commit -m "feat(beta): тумблер инвайт-режима, демо-поездка и телеграм в настройках"
```

---

### Task 9: Форма входа — поле кода и контакт

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/register-options` (Task 5), поле `inviteCode` регистрации (Task 4).

- [ ] **Step 1: Импорты и запрос режима**

Добавить `import { useQuery } from "@tanstack/react-query";` и `import { Ticket } from "lucide-react";`.

В `LoginPageContent` (после `const searchParams = …`):

```ts
  // Режим регистрации с сервера: закрыта ли регистрация и нужен ли инвайт-код
  const { data: regOptions } = useQuery({
    queryKey: ["register-options"],
    queryFn: async (): Promise<{ registrationEnabled: boolean; inviteRequired: boolean; contactTelegram: string | null }> => {
      const r = await fetch("/api/auth/register-options");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    staleTime: 60_000,
  });
  const inviteRequired = mode === "register" && regOptions?.inviteRequired === true;
```

- [ ] **Step 2: Состояние кода и валидация**

Рядом с остальными состояниями: `const [invite, setInvite] = useState("");`

В `submit` при `mode === "register"` после проверки имени:

```ts
      if (inviteRequired && !invite.trim()) {
        toast.error("Введите инвайт-код");
        return;
      }
```

В тело POST регистрации добавить `inviteCode: invite || undefined`.

- [ ] **Step 3: Поле в форме**

В блоке формы, после поля «Имя» (внутрь `mode === "register" &&` нельзя — поле нужно только когда `inviteRequired`), добавить отдельным блоком после «Имени»:

```tsx
            {mode === "register" && inviteRequired && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Инвайт-код</label>
                <input
                  type="text"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="Из описания видео или от друга"
                  autoCapitalize="characters"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm uppercase"
                />
              </div>
            )}
            {mode === "register" && regOptions && regOptions.registrationEnabled === false && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Регистрация новых аккаунтов сейчас закрыта.
              </p>
            )}
```

- [ ] **Step 4: Футер с контактом**

Перед блоком демо-аккаунтов (в конец карточки):

```tsx
          {regOptions?.contactTelegram && (
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Застряли? Напишите нам:{" "}
              <a
                href={regOptions.contactTelegram.startsWith("@")
                  ? `https://t.me/${regOptions.contactTelegram.slice(1)}`
                  : regOptions.contactTelegram}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {regOptions.contactTelegram}
              </a>
            </p>
          )}
```

- [ ] **Step 5: Проверка**

Открыть `/login?mode=register` при включённом inviteRequired: поле кода видно, пустой сабмит — тост «Введите инвайт-код», регистрация с кодом из Task 7 проходит. Выключить inviteRequired в админке — поле исчезает (staleTime 60 c, после рефреша страницы).

Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(beta): поле инвайт-кода и контакт поддержки на форме входа"
```

---

### Task 10: Лендинг `/landing`

> **Как сделано (факт):** лендинг не по наброску ниже. Разметка — `src/app/landing/landing-view.tsx` (чистая, без хуков), стили — `landing.css`, картинки — webp-скриншоты и фото в `public/landing/`, SVG-плейсхолдеры не создавались. `page.tsx` читает `getPublicShowcase()` и монтирует `<YandexMetrika />`; разбор полей витрины в ссылки — `showcase.ts` (+ тест). Шаги 2–3 ниже — исходный набросок, для справки.

**Files:**
- Create: `src/app/landing/page.tsx`
- Create: `src/components/analytics/yandex-metrika.tsx` (лендинг его импортирует — создаём здесь)
- Create: `public/landing/route.svg`, `public/landing/planner.svg`, `public/landing/budget.svg`, `public/landing/gallery.svg`, `public/landing/together.svg`, `public/landing/trip.svg` (плейсхолдеры — владелец заменит скриншотами)

**Interfaces:**
- Consumes: `getPublicShowcase()` (Task 3).
- Produces: публичная страница `/landing` (доступна всем, вошедшим тоже); `/` и `/login` ведут себя как раньше; `<YandexMetrika />` (Task 11 монтирует его ещё и на `/login`).

- [ ] **Step 1: middleware.ts не меняем**

Текущий matcher (`/`, `/split`, `/split/:path*`) не включает `/landing`, значит страница открыта без сессии. Гость на `/` по-прежнему получает редирект на `/login` — на лендинг его не переписываем. Ничего править не нужно; проверка — в Step 5.

- [ ] **Step 2: Плейсхолдеры скриншотов**

Создать 6 файлов (пример для `public/landing/route.svg`, остальные — меняя подпись):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#f4f4f5"/>
  <text x="400" y="300" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#a1a1aa">Скриншот: маршрут по дням</text>
</svg>
```

Подписи: route → «маршрут по дням», planner → «ИИ-планер», budget → «бюджет и долги», gallery → «галерея», together → «чат и пушы», trip → «в поездке».

- [ ] **Step 3: src/app/landing/page.tsx**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Camera,
  Map as MapIcon,
  MessageCircle,
  Sparkles,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { getPublicShowcase } from "@/lib/app-config";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";

export const dynamic = "force-dynamic"; // витрина читает AppSettings: демо-токен и контакт меняются из админки

export const metadata: Metadata = {
  title: "TripTrek — планирование путешествий вместе",
  description:
    "Маршрут по дням, общий бюджет с расчётом долгов, галерея и дневник — одно приложение для всей компании.",
  openGraph: {
    title: "TripTrek — планирование путешествий вместе",
    description: "Маршрут, бюджет, галерея и дневник поездки — в одном приложении.",
    images: ["/og-image.jpg"],
  },
};

// Блоки «Возможностей»: картинка + одна мысль. Картинки в public/landing/ —
// плейсхолдеры, владелец заменит скриншотами (пути тогда меняются на .png)
const FEATURES = [
  {
    icon: MapIcon,
    img: "/landing/route.svg",
    title: "Маршрут по дням",
    text: "Места, время, жильё и нити маршрута на карте — план виден целиком.",
  },
  {
    icon: Bot,
    img: "/landing/planner.svg",
    title: "ИИ-планер",
    text: "Черновик маршрута из реальных мест — вы подтверждаете каждый пункт.",
  },
  {
    icon: Wallet,
    img: "/landing/budget.svg",
    title: "Общий бюджет",
    text: "Траты в любых валютах и честное «кто кому сколько должен».",
  },
  {
    icon: Camera,
    img: "/landing/gallery.svg",
    title: "Галерея и дневник",
    text: "Фото грузятся в фоне и переживают закрытие приложения, дневник остаётся.",
  },
  {
    icon: MessageCircle,
    img: "/landing/together.svg",
    title: "Вместе в реальном времени",
    text: "Чат, пуши и приглашение в поездку кодом — все видят изменения сразу.",
  },
  {
    icon: UtensilsCrossed,
    img: "/landing/trip.svg",
    title: "Помощники в поездке",
    text: "Гастрогид, разговорник с ИИ, погода и достижения за посещённые места.",
  },
];

export default async function LandingPage() {
  const showcase = await getPublicShowcase();
  const registerHref = "/login?mode=register";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <YandexMetrika />

      {/* === Hero === */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600 text-white">
        <div className="absolute top-10 left-10 size-40 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute bottom-10 right-10 size-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center space-y-6">
          <img src="/icon-192.png" alt="Логотип TripTrek" className="mx-auto size-20 rounded-3xl shadow-xl" />
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Путешествие планируем вместе
          </h1>
          <p className="text-lg text-white/85 max-w-xl mx-auto">
            Маршрут по дням, общий бюджет, галерея и дневник — всё в одном месте,
            на телефоне у каждого участника поездки.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={registerHref}
              className="min-h-12 inline-flex items-center rounded-2xl bg-white px-7 font-semibold text-foreground shadow-lg transition-transform active:scale-95"
            >
              Начать планирование
            </Link>
            {showcase.inviteRequired && (
              <Link
                href={registerHref}
                className="min-h-12 inline-flex items-center rounded-2xl border border-white/40 px-7 font-semibold transition-transform active:scale-95"
              >
                У меня есть код
              </Link>
            )}
          </div>
          <p className="inline-block rounded-full bg-black/20 px-3 py-1 text-xs">
            Бета: могут быть шероховатости — внутри есть кнопка «Сообщить о баге», мы читаем всё
          </p>
        </div>
      </section>

      {/* === Возможности === */}
      <section className="mx-auto max-w-4xl px-4 py-16 space-y-8">
        <h2 className="text-center text-2xl font-bold">На что способно приложение</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article key={f.title} className="rounded-3xl border border-border bg-card overflow-hidden">
                <img src={f.img} alt={f.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <div className="p-4 space-y-1.5">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    {f.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* === Живой пример === */}
      {showcase.demoTripToken && (
        <section className="mx-auto max-w-4xl px-4 pb-16">
          <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-4">
            <Sparkles className="mx-auto size-6 text-primary" />
            <h2 className="text-2xl font-bold">Вот так выглядит настоящая поездка</h2>
            <p className="text-sm text-muted-foreground">
              Публичная страница реального путешествия: маршрут, карта и галерея.
            </p>
            <Link
              href={`/p/${showcase.demoTripToken}`}
              className="inline-flex min-h-12 items-center rounded-2xl bg-primary px-7 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
            >
              Открыть живой пример
            </Link>
          </div>
        </section>
      )}

      {/* === CTA + футер === */}
      <section className="mx-auto max-w-4xl px-4 pb-16 text-center space-y-4">
        <Link
          href={registerHref}
          className="inline-flex min-h-12 items-center rounded-2xl bg-primary px-8 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          Планировать свою поездку
        </Link>
        <footer className="pt-6 text-xs text-muted-foreground space-y-1">
          <p>
            Фото чистятся от геометок, пароли хранятся только в виде хешей.
          </p>
          {showcase.contactTelegram && (
            <p>
              Вопросы —{" "}
              <a
                href={showcase.contactTelegram.startsWith("@")
                  ? `https://t.me/${showcase.contactTelegram.slice(1)}`
                  : showcase.contactTelegram}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {showcase.contactTelegram}
              </a>
            </p>
          )}
        </footer>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: src/components/analytics/yandex-metrika.tsx**

```tsx
import Script from "next/script";

// Яндекс.Метрика для воронки беты (видео → визит → регистрация). Идентификатор
// приходит через env: без NEXT_PUBLIC_YANDEX_METRIKA_ID скрипт не подключается
// вовсе — dev и приватные инстансы остаются без внешних запросов.
const ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;

export function YandexMetrika() {
  if (!ID) return null;
  return (
    <Script
      id="yandex-metrika"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html:
          `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};` +
          `m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,` +
          `k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");` +
          `ym(${ID}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false });`,
      }}
    />
  );
}
```

- [ ] **Step 5: Проверка**

Run: `bun server.ts`; в инкогнито открыть `http://localhost:3000/` — редирект на `/login` (как раньше), а `/landing` открывается без входа; вошедшим `/landing` тоже доступна; при заданном `demoTripToken` в админке виден блок «Живой пример»; с `NEXT_PUBLIC_YANDEX_METRIKA_ID=11111111 bun server.ts` в Network есть запрос к `mc.yandex.ru`, без переменной — нет.

- [ ] **Step 6: Commit — вместе с Task 11**

```bash
git add src/app/landing public/landing src/components/analytics/yandex-metrika.tsx
git commit -m "feat(beta): страница-презентация /landing"
```

---

### Task 11: Метрика на /login + env в runbook

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `docker-deploy/DEPLOY.md` (env-таблица и чеклист)

**Interfaces:**
- Consumes: `<YandexMetrika />` из Task 10.

- [ ] **Step 1: Смонтировать на /login**

В `src/app/login/page.tsx` добавить `import { YandexMetrika } from "@/components/analytics/yandex-metrika";` и `<YandexMetrika />` внутрь `<main>` первым элементом.

- [ ] **Step 2: DEPLOY.md — env и чеклист**

В таблицу env-переменных добавить строку: `NEXT_PUBLIC_YANDEX_METRIKA_ID` — app — «номер счётчика Метрики; без переменной метрика не подключается». В чеклист после деплоя добавить пункты: «проверить сброс пароля письмом (SMTP)», «при обновлении раздачи поднять CACHE_VERSION в public/sw.js».

- [ ] **Step 3: Commit (вместе с Task 10)**

```bash
git add src/app/login/page.tsx docker-deploy/DEPLOY.md
git commit -m "feat(beta): Яндекс.Метрика на входе и env в runbook"
```

---

### Task 12: Финальная сверка — доки, lint, тесты, сборка

**Files:**
- Modify: `docs/architecture.md` (§5 «Модель данных»)
- Modify: `docs/glossary.md`
- Modify: `AGENTS.md` (карта репозитория + «Лимиты, премиум, ИИ»)

**Interfaces:**
- Consumes: всё предыдущее.

- [ ] **Step 1: docs/architecture.md §5**

Добавить к описанию моделей: `InviteCode` (инвайт-коды приложения, usedCount — авторитетный счётчик, атомарное занятие слота в `api/auth/register`) и три поля `AppSettings` (`inviteRequired`, `demoTripToken`, `contactTelegram`).

- [ ] **Step 2: docs/glossary.md**

Термин «Инвайт-код приложения» — «код бета-доступа на регистрацию аккаунта; не путать с инвайт-кодом поездки (Trip.inviteCode), который даёт вход в конкретную поездку». В «Фичи главного экрана»/структуру — пункт «Лендинг» (`/landing`, открытая презентация для ссылки из TikTok; корень для гостя по-прежнему ведёт на `/login`).

- [ ] **Step 3: AGENTS.md**

В карту репозитория (строка `src/lib/`) добавить `invite-code.ts` (инвайт-коды приложения: генерация/нормализация/статус; занятие слота — атомарный updateMany в register). В раздел «Лимиты, премиум, ИИ» — одну строку: «Бета-гейт: `inviteRequired` в AppSettings — регистрация по кодам из `/api/admin/invites`; витрина лендинга — `getPublicShowcase`».

- [ ] **Step 4: Прогон**

Run: `bun run lint && bun run test && bun run build`
Expected: lint 0 ошибок; тесты зелёные; production-сборка успешна.

- [ ] **Step 5: Полный смоук на dev-сервере (`bun server.ts`)**

1. Админка: создать код `maxUses=1`; включить `inviteRequired`.
2. Инкогнито: `/` → `/login`, `/landing` открывается без входа; «У меня есть код» → регистрация без кода → 400-тост; с кодом → вход, юзер создан, `usedCount=1`.
3. Повторная регистрация с тем же кодом → «Код недействителен или все места по нему заняты».
4. Выключить `inviteRequired` → поле кода исчезло, регистрация проходит без кода.
5. `/login` показывает телеграм-контакт из настроек; ссылка `t.me` корректна.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture.md docs/glossary.md AGENTS.md
git commit -m "docs(beta): инвайт-коды и лендинг в архитектуре, глоссарии и карте репозитория"
```

---

## После плана: чеклист запуска (не код, из спеки §5)

1. Сгенерировать коды кампании (например, один код `maxUses=100`).
2. Выложить 1–2 поездки публичными, токен демо — в настройки.
3. Прод-проверки: регистрация с кодом/без, сброс пароля письмом, OG-превью ссылки `/landing` из био; `/` гостем уходит на `/login`.
4. Включить `inviteRequired`, задать `contactTelegram`.
5. Метрика: завести счётчик, задать `NEXT_PUBLIC_YANDEX_METRIKA_ID`, пересобрать контейнер, поднять `CACHE_VERSION` в `public/sw.js`.
6. Скриншоты `public/landing/shot-*.webp` сняты со шрифтом Inter вместо системного; перед широкой рекламой переснять и обновлять после заметных правок интерфейса.
