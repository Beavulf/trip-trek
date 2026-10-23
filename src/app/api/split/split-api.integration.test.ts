// Интеграционный прогон API «Сочтёмся» на настоящем Postgres: вызываем обработчики роутов напрямую
// (без Next-сервера) с настоящими JWT-куками. Нужна пустая база с применёнными миграциями:
//
//   docker run -d --rm --name split-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=split -p 127.0.0.1:54329:5432 postgres:16-alpine
//   DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/split bunx prisma migrate deploy
//   SPLIT_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/split bunx vitest run src/app/api/split
//
// Без SPLIT_TEST_DATABASE_URL набор пропускается (CI без базы остаётся зелёным).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const URL_ENV = process.env.SPLIT_TEST_DATABASE_URL;

// Курсы для повторяющихся трат в иностранной валюте: подменяем сетевой вызов, тест не ходит в интернет.
// null — «курсов нет», трата в этом случае не должна создаваться
const fx = vi.hoisted(() => ({ rates: { USD: 1, BYN: 3.2 } as Record<string, number> | null }));
vi.mock("@/lib/split/fx-server", () => ({ fetchRates: async () => fx.rates }));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!URL_ENV)("API «Сочтёмся» (Postgres)", () => {
  let db: typeof import("@/lib/db").db;
  // Секрет JWT — случайный на каждый прогон: набор работает только с одноразовой базой, постоянного значения не нужно
  const SECRET = randomBytes(32).toString("hex");
  const users: Record<string, { id: string; cookie: string }> = {};

  // Динамические импорты: DATABASE_URL должен быть выставлен ДО создания PrismaClient в @/lib/db
  let groupsRoute: typeof import("./groups/route");
  let groupRoute: typeof import("./groups/[groupId]/route");
  let ledgerRoute: typeof import("./groups/[groupId]/ledger/route");
  let expensesRoute: typeof import("./groups/[groupId]/expenses/route");
  let expenseRoute: typeof import("./groups/[groupId]/expenses/[expenseId]/route");
  let paymentsRoute: typeof import("./groups/[groupId]/payments/route");
  let recurringRoute: typeof import("./groups/[groupId]/recurring/route");
  let activityRoute: typeof import("./groups/[groupId]/activity/route");
  let membersRoute: typeof import("./groups/[groupId]/members/route");
  let memberRoute: typeof import("./groups/[groupId]/members/[memberId]/route");
  let joinRoute: typeof import("./join/route");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_ENV!;
    process.env.NEXTAUTH_SECRET = SECRET;
    ({ db } = await import("@/lib/db"));
    groupsRoute = await import("./groups/route");
    groupRoute = await import("./groups/[groupId]/route");
    ledgerRoute = await import("./groups/[groupId]/ledger/route");
    expensesRoute = await import("./groups/[groupId]/expenses/route");
    expenseRoute = await import("./groups/[groupId]/expenses/[expenseId]/route");
    paymentsRoute = await import("./groups/[groupId]/payments/route");
    recurringRoute = await import("./groups/[groupId]/recurring/route");
    activityRoute = await import("./groups/[groupId]/activity/route");
    membersRoute = await import("./groups/[groupId]/members/route");
    memberRoute = await import("./groups/[groupId]/members/[memberId]/route");
    joinRoute = await import("./join/route");

    for (const key of ["alice", "boris", "clara", "dan"]) {
      const u = await db.user.create({
        data: { email: `${key}-${Date.now()}@split.test`, name: key, password: "x", emoji: "🦊", color: "#10b981" },
      });
      users[key] = {
        id: u.id,
        cookie: `next-auth.session-token=${jwt.sign({ id: u.id, name: key, email: u.email }, SECRET, { algorithm: "HS256" })}`,
      };
    }
  });

  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    // Группы пользователей удаляются каскадом; затем сами пользователи
    const { deleteSplitGroup } = await import("@/lib/split/server");
    const groups = await db.splitMember.findMany({ where: { userId: { in: ids } }, select: { groupId: true } });
    for (const g of new Set(groups.map((x) => x.groupId))) await deleteSplitGroup(g).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  const req = (path: string, who: string | null, init: { method?: string; body?: unknown } = {}) =>
    new NextRequest(`http://localhost/api/split${path}`, {
      method: init.method ?? "GET",
      headers: { ...(who ? { cookie: users[who].cookie } : {}), "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const json = async (res: Response): Promise<Json> => res.json();

  const today = new Date().toISOString().slice(0, 10);

  // --- Сквозной сценарий: квартира из трёх человек ---
  let groupId = "";
  let code = "";
  let aliceM = "";
  let borisM = "";
  let leshaM = ""; // участник без аккаунта
  let expenseId = "";

  it("создание группы: владелец, короткий код, валюта", async () => {
    const res = await groupsRoute.POST(req("/groups", "alice", { method: "POST", body: { name: "Квартира", currency: "byn", emoji: "🏠" } }));
    expect(res.status).toBe(201);
    const g = await json(res);
    groupId = g.id;
    code = g.inviteCode;
    aliceM = g.myMemberId;
    expect(g.currency).toBe("BYN");
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(g.members).toHaveLength(1);
    expect(g.members[0]).toMatchObject({ role: "owner", status: "active", userId: users.alice.id });
  });

  it("неавторизованный и посторонний не видят группу", async () => {
    expect((await groupRoute.GET(req(`/groups/${groupId}`, null), ctx({ groupId }))).status).toBe(401);
    expect((await groupRoute.GET(req(`/groups/${groupId}`, "dan"), ctx({ groupId }))).status).toBe(403);
    expect((await ledgerRoute.GET(req(`/groups/${groupId}/ledger`, "dan"), ctx({ groupId }))).status).toBe(403);
  });

  it("превью по коду открыто без входа и не светит лишнего", async () => {
    const res = await joinRoute.GET(req(`/join?code=${code.toLowerCase()}`, null));
    expect(res.status).toBe(200);
    const p = await json(res);
    expect(p).toMatchObject({ name: "Квартира", currency: "BYN" });
    expect(p.members).toHaveLength(1);
    expect(JSON.stringify(p)).not.toContain(users.alice.id);
    expect((await joinRoute.GET(req("/join?code=NOPENOPE", null))).status).toBe(404);
  });

  it("вступление по коду; повторное вступление идемпотентно", async () => {
    const res = await joinRoute.POST(req(`/join?code=${code}`, "boris", { method: "POST", body: {} }));
    expect(res.status).toBe(200);
    const j = await json(res);
    expect(j.groupId).toBe(groupId);
    borisM = j.memberId;
    const again = await json(await joinRoute.POST(req(`/join?code=${code}`, "boris", { method: "POST", body: {} })));
    expect(again.alreadyMember).toBe(true);
  });

  it("участник без аккаунта добавляется любым участником", async () => {
    const res = await membersRoute.POST(req(`/groups/${groupId}/members`, "boris", { method: "POST", body: { displayName: "Лёша" } }), ctx({ groupId }));
    expect(res.status).toBe(201);
    const m = await json(res);
    leshaM = m.id;
    expect(m.userId).toBeNull();
    expect((await membersRoute.POST(req(`/groups/${groupId}/members`, "dan", { method: "POST", body: { displayName: "X" } }), ctx({ groupId }))).status).toBe(403);
  });

  it("трата на троих: сервер сам считает доли, Σ долей = сумме", async () => {
    const res = await expensesRoute.POST(
      req(`/groups/${groupId}/expenses`, "alice", {
        method: "POST",
        body: {
          amountCents: 10000,
          description: "Продукты",
          category: "groceries",
          paidById: aliceM,
          spentOn: today,
          splitMode: "equal",
          split: [{ memberId: aliceM }, { memberId: borisM }, { memberId: leshaM }],
        },
      }),
      ctx({ groupId })
    );
    expect(res.status).toBe(201);
    const e = await json(res);
    expenseId = e.id;
    expect(e.shares.reduce((a: number, s: { cents: number }) => a + s.cents, 0)).toBe(10000);
    expect(e.shares.map((s: { cents: number }) => s.cents).sort()).toEqual([3333, 3333, 3334]);
  });

  it("невалидные траты отвергаются: чужой плательщик, не сходящиеся суммы, дата из будущего", async () => {
    const base = { amountCents: 1000, description: "x", category: "other", paidById: aliceM, spentOn: today, splitMode: "equal", split: [{ memberId: aliceM }] };
    const post = (over: Json) => expensesRoute.POST(req(`/groups/${groupId}/expenses`, "alice", { method: "POST", body: { ...base, ...over } }), ctx({ groupId }));
    expect((await post({ paidById: "чужой" })).status).toBe(400);
    expect((await post({ splitMode: "exact", split: [{ memberId: aliceM, value: 999 }] })).status).toBe(400);
    expect((await post({ spentOn: "2099-01-01" })).status).toBe(400);
    expect((await post({ amountCents: 0 })).status).toBe(400);
    expect((await post({ amountCents: 10.5 })).status).toBe(400);
  });

  it("правка траты пишет в журнал дифф; без изменений журнал не засоряется", async () => {
    const patch = (body: Json) => expenseRoute.PATCH(req(`/groups/${groupId}/expenses/${expenseId}`, "boris", { method: "PATCH", body }), ctx({ groupId, expenseId }));
    const body = {
      amountCents: 12000,
      description: "Продукты",
      category: "groceries",
      paidById: aliceM,
      spentOn: today,
      splitMode: "equal",
      split: [{ memberId: aliceM }, { memberId: borisM }, { memberId: leshaM }],
    };
    const res = await patch(body);
    expect(res.status).toBe(200);
    expect((await json(res)).amountCents).toBe(12000);
    const noop = await patch(body);
    expect(noop.status).toBe(200);

    const act = await json(await activityRoute.GET(req(`/groups/${groupId}/activity`, "alice"), ctx({ groupId })));
    const updates = act.items.filter((a: Json) => a.type === "expense.updated");
    expect(updates).toHaveLength(1);
    expect(updates[0].data.changes).toEqual([{ field: "amountCents", from: 10000, to: 12000 }]);
  });

  it("баланс на хабе совпадает с расчётом по тратам", async () => {
    const { memberBalances } = await import("@/lib/split/balances");
    const ledger = await json(await ledgerRoute.GET(req(`/groups/${groupId}/ledger`, "alice"), ctx({ groupId })));
    const bal = memberBalances(ledger.expenses, ledger.payments);
    expect(bal.get(aliceM)).toBe(8000); // заплатила 12000, своя доля 4000
    expect(bal.get(borisM)).toBe(-4000);
    const hub = await json(await groupsRoute.GET(req("/groups", "alice")));
    expect(hub.find((g: Json) => g.id === groupId).myBalanceCents).toBe(8000);
    const hubB = await json(await groupsRoute.GET(req("/groups", "boris")));
    expect(hubB.find((g: Json) => g.id === groupId).myBalanceCents).toBe(-4000);
  });

  it("перевод: записывает только сторона пары, повтор с тем же ключом идемпотентен", async () => {
    const pay = (who: string, body: Json) => paymentsRoute.POST(req(`/groups/${groupId}/payments`, who, { method: "POST", body }), ctx({ groupId }));
    const body = { fromId: borisM, toId: aliceM, amountCents: 4000, paidOn: today, clientKey: "k-1" };
    const r1 = await pay("boris", body);
    expect(r1.status).toBe(201);
    const p1 = await json(r1);
    const r2 = await pay("boris", body);
    expect((await json(r2)).id).toBe(p1.id);
    expect(await db.splitPayment.count({ where: { groupId } })).toBe(1);

    // Алиса (получатель) тоже может записать; посторонний участник пары — нет
    expect((await pay("alice", { ...body, amountCents: 100, clientKey: "k-2" })).status).toBe(201);
    await db.splitPayment.deleteMany({ where: { groupId, clientKey: "k-2" } });
    // Лёша — безаккаунтный, Борис не сторона перевода Алиса→Лёша
    expect((await pay("boris", { fromId: aliceM, toId: leshaM, amountCents: 100, paidOn: today, clientKey: "k-3" })).status).toBe(403);
    // Себе нельзя
    expect((await pay("alice", { fromId: aliceM, toId: aliceM, amountCents: 100, paidOn: today })).status).toBe(400);
  });

  it("после перевода Борис в расчёте с Алисой", async () => {
    const { pairDebts } = await import("@/lib/split/balances");
    const ledger = await json(await ledgerRoute.GET(req(`/groups/${groupId}/ledger`, "boris"), ctx({ groupId })));
    const debts = pairDebts(ledger.expenses, ledger.payments);
    expect(debts).toEqual([{ fromId: leshaM, toId: aliceM, cents: 4000 }]);
  });

  it("повторяющаяся трата: создаётся лениво за прошлые периоды, идемпотентно, удалённый период не воскресает", async () => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 2);
    const startsOn = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const res = await recurringRoute.POST(
      req(`/groups/${groupId}/recurring`, "alice", {
        method: "POST",
        body: {
          description: "Аренда",
          category: "rent",
          amountCents: 60000,
          paidById: aliceM,
          splitMode: "percent",
          split: [{ memberId: aliceM, value: 6000 }, { memberId: borisM, value: 4000 }],
          dayOfMonth: 1,
          startsOn,
        },
      }),
      ctx({ groupId })
    );
    expect(res.status).toBe(201);

    const read = async () => json(await ledgerRoute.GET(req(`/groups/${groupId}/ledger`, "alice"), ctx({ groupId })));
    const first = await read();
    const rent = first.expenses.filter((e: Json) => e.recurringId);
    expect(rent.length).toBe(3); // два прошлых месяца + текущий (1-е число уже наступило)
    expect(rent[0].shares.map((s: Json) => s.cents).sort((a: number, b: number) => a - b)).toEqual([24000, 36000]);

    const second = await read();
    expect(second.expenses.filter((e: Json) => e.recurringId)).toHaveLength(3); // не задвоилось

    // Удаляем один период — он не должен вернуться
    const victim = rent[rent.length - 1];
    const del = await expenseRoute.DELETE(req(`/groups/${groupId}/expenses/${victim.id}`, "boris", { method: "DELETE" }), ctx({ groupId, expenseId: victim.id }));
    expect(del.status).toBe(200);
    const third = await read();
    expect(third.expenses.filter((e: Json) => e.recurringId)).toHaveLength(2);
  });

  it("трата в другой валюте: сохраняется исходная сумма, долги считаются в валюте группы, правка валюты пишется в журнал", async () => {
    const body = {
      amountCents: 16000, // 50 $ по курсу 3,2
      original: { amountCents: 5000, currency: "usd" },
      description: "Подарок хозяйке",
      category: "gifts",
      paidById: aliceM,
      spentOn: today,
      splitMode: "equal",
      split: [{ memberId: aliceM }, { memberId: borisM }],
    };
    const res = await expensesRoute.POST(req(`/groups/${groupId}/expenses`, "alice", { method: "POST", body }), ctx({ groupId }));
    expect(res.status).toBe(201);
    const e = await json(res);
    expect(e).toMatchObject({ amountCents: 16000, originalAmountCents: 5000, originalCurrency: "USD" });
    expect(e.shares.map((x: Json) => x.cents)).toEqual([8000, 8000]); // доли — в валюте группы

    // Вернули в валюту группы: исходной суммы больше нет, в журнале — одно изменение «original»
    const patched = await expenseRoute.PATCH(
      req(`/groups/${groupId}/expenses/${e.id}`, "alice", { method: "PATCH", body: { ...body, original: null } }),
      ctx({ groupId, expenseId: e.id })
    );
    expect(patched.status).toBe(200);
    expect(await json(patched)).toMatchObject({ originalAmountCents: null, originalCurrency: null });
    const act = await json(await activityRoute.GET(req(`/groups/${groupId}/activity`, "alice"), ctx({ groupId })));
    const last = act.items.find((a: Json) => a.type === "expense.updated" && a.data.description === "Подарок хозяйке");
    expect(last.data.changes).toEqual([{ field: "original", from: "USD:5000", to: null }]);

    await expenseRoute.DELETE(req(`/groups/${groupId}/expenses/${e.id}`, "alice", { method: "DELETE" }), ctx({ groupId, expenseId: e.id }));
  });

  it("битая исходная сумма отвергается", async () => {
    const bad = (original: unknown) =>
      expensesRoute.POST(
        req(`/groups/${groupId}/expenses`, "alice", {
          method: "POST",
          body: { amountCents: 1000, original, description: "x", category: "other", paidById: aliceM, spentOn: today, splitMode: "equal", split: [{ memberId: aliceM }] },
        }),
        ctx({ groupId })
      );
    expect((await bad({ amountCents: 0, currency: "USD" })).status).toBe(400);
    expect((await bad({ amountCents: 100, currency: "DOLLAR" })).status).toBe(400);
    expect((await bad("USD")).status).toBe(400);
  });

  it("аренда в долларах: каждый период пересчитывается по курсу на момент создания; без курсов — не создаётся", async () => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 1);
    const startsOn = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const rentUsd = {
      description: "Аренда в долларах",
      category: "rent",
      amountCents: 160000, // сегодняшний пересчёт клиента; сервер при создании считает сам
      original: { amountCents: 50000, currency: "USD" },
      paidById: aliceM,
      splitMode: "exact",
      split: [{ memberId: aliceM, value: 96000 }, { memberId: borisM, value: 64000 }],
      dayOfMonth: 1,
      startsOn,
    };
    const read = async () => json(await ledgerRoute.GET(req(`/groups/${groupId}/ledger`, "alice"), ctx({ groupId })));
    const mine = (l: Json) => l.expenses.filter((e: Json) => e.description === "Аренда в долларах");

    // 1) курсов нет — трата не создаётся и шаблон не ставится на паузу
    fx.rates = null;
    const created = await recurringRoute.POST(req(`/groups/${groupId}/recurring`, "alice", { method: "POST", body: rentUsd }), ctx({ groupId }));
    expect(created.status).toBe(201);
    const recurringId = (await json(created)).id;
    expect(mine(await read())).toHaveLength(0);
    expect((await db.splitRecurring.findUnique({ where: { id: recurringId } }))?.active).toBe(true);

    // 2) курсы вернулись — создаются оба периода, сумма и доли пересчитаны (курс 3,2 → 1600 Br; 60/40 сохранены)
    fx.rates = { USD: 1, BYN: 3.2 };
    const rent = mine(await read());
    expect(rent).toHaveLength(2);
    for (const e of rent) {
      expect(e).toMatchObject({ amountCents: 160000, originalAmountCents: 50000, originalCurrency: "USD", splitMode: "exact" });
      expect(e.shares.map((x: Json) => x.cents).sort((a: number, b: number) => a - b)).toEqual([64000, 96000]);
    }

    // 3) следующий месяц при другом курсе дал бы другую сумму, но уже созданные периоды не пересчитываются
    fx.rates = { USD: 1, BYN: 3.5 };
    expect(mine(await read()).every((e: Json) => e.amountCents === 160000)).toBe(true);

  });

  it("«Это я»: безаккаунтного занимает вошедший, второй захват отвергается", async () => {
    const preview = await json(await joinRoute.GET(req(`/join?code=${code}`, null)));
    expect(preview.claimable.map((c: Json) => c.id)).toContain(leshaM);

    const ok = await joinRoute.POST(req(`/join?code=${code}`, "clara", { method: "POST", body: { claimMemberId: leshaM } }));
    expect(ok.status).toBe(200);
    expect((await json(ok)).memberId).toBe(leshaM);
    const row = await db.splitMember.findUnique({ where: { id: leshaM } });
    expect(row?.userId).toBe(users.clara.id);

    // История Лёши теперь у Клары: она видит группу и свой долг
    const hub = await json(await groupsRoute.GET(req("/groups", "clara")));
    expect(hub.find((g: Json) => g.id === groupId).myBalanceCents).toBeLessThan(0);

    const dup = await joinRoute.POST(req(`/join?code=${code}`, "dan", { method: "POST", body: { claimMemberId: leshaM } }));
    expect(dup.status).toBe(409);
  });

  it("выход: строка и долги остаются, доступ закрыт; исключённый не возвращается по коду", async () => {
    const leave = await memberRoute.DELETE(req(`/groups/${groupId}/members/${borisM}`, "boris", { method: "DELETE" }), ctx({ groupId, memberId: borisM }));
    expect(leave.status).toBe(200);
    expect((await ledgerRoute.GET(req(`/groups/${groupId}/ledger`, "boris"), ctx({ groupId }))).status).toBe(403);

    const group = await json(await groupRoute.GET(req(`/groups/${groupId}`, "alice"), ctx({ groupId })));
    expect(group.members.find((m: Json) => m.id === borisM).status).toBe("left");

    // Владелец не может выйти
    expect((await memberRoute.DELETE(req(`/groups/${groupId}/members/${aliceM}`, "alice", { method: "DELETE" }), ctx({ groupId, memberId: aliceM }))).status).toBe(400);

    // Исключить может только владелец
    const rm = await memberRoute.DELETE(req(`/groups/${groupId}/members/${leshaM}`, "dan", { method: "DELETE" }), ctx({ groupId, memberId: leshaM }));
    expect(rm.status).toBe(403);
    const removed = await memberRoute.DELETE(req(`/groups/${groupId}/members/${leshaM}`, "alice", { method: "DELETE" }), ctx({ groupId, memberId: leshaM }));
    expect(removed.status).toBe(200);
    const back = await joinRoute.POST(req(`/join?code=${code}`, "clara", { method: "POST", body: {} }));
    expect(back.status).toBe(403);

    // Вышедший вернуться по коду может
    const returned = await joinRoute.POST(req(`/join?code=${code}`, "boris", { method: "POST", body: {} }));
    expect(returned.status).toBe(200);
    expect((await json(returned)).memberId).toBe(borisM);
  });

  it("валюту нельзя менять, когда есть траты; настройки приглашений — только владельцу", async () => {
    const patch = (who: string, body: Json) => groupRoute.PATCH(req(`/groups/${groupId}`, who, { method: "PATCH", body }), ctx({ groupId }));
    expect((await patch("alice", { currency: "USD" })).status).toBe(409);
    expect((await patch("boris", { allowMemberInvites: false })).status).toBe(403);
    expect((await patch("boris", { name: "Наша квартира" })).status).toBe(200);
    expect((await patch("alice", { allowMemberInvites: false })).status).toBe(200);
    const asBoris = await json(await groupRoute.GET(req(`/groups/${groupId}`, "boris"), ctx({ groupId })));
    expect(asBoris.inviteCode).toBeNull(); // код спрятан от не-владельца
    const asAlice = await json(await groupRoute.GET(req(`/groups/${groupId}`, "alice"), ctx({ groupId })));
    expect(asAlice.inviteCode).toBe(code);
  });

  it("удаление группы: только владелец и только с точным названием", async () => {
    const del = (who: string, name: string) => groupRoute.DELETE(req(`/groups/${groupId}`, who, { method: "DELETE", body: { name } }), ctx({ groupId }));
    expect((await del("boris", "Наша квартира")).status).toBe(403);
    expect((await del("alice", "не то")).status).toBe(400);
    expect((await del("alice", "Наша квартира")).status).toBe(200);
    expect(await db.splitExpense.count({ where: { groupId } })).toBe(0);
    expect(await db.splitMember.count({ where: { groupId } })).toBe(0);
  });
});
