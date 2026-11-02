// Интеграционный прогон чек-листа на настоящем Postgres: пачка из шаблонов, порядок, права.
// База и запуск те же, что у API «Сочтёмся»:
//   SPLIT_TEST_DATABASE_URL=postgresql://… bunx vitest run src/app/api/checklist
// Без переменной набор пропускается.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const URL_ENV = process.env.SPLIT_TEST_DATABASE_URL;

describe.skipIf(!URL_ENV)("API чек-листа (Postgres)", () => {
  let db: typeof import("@/lib/db").db;
  let route: typeof import("./route");
  const SECRET = randomBytes(32).toString("hex");
  const stamp = Date.now();
  const cookies: Record<string, string> = {};
  let tripId = "";

  const post = (who: string, body: unknown) =>
    route.POST(
      new NextRequest("http://localhost/api/checklist", {
        method: "POST",
        headers: { cookie: cookies[who], "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_ENV!;
    process.env.NEXTAUTH_SECRET = SECRET;
    ({ db } = await import("@/lib/db"));
    route = await import("./route");
    const ids: Record<string, string> = {};
    for (const key of ["owner", "viewer"]) {
      const u = await db.user.create({ data: { email: `${key}-${stamp}@checklist.test`, name: key, password: "x" } });
      ids[key] = u.id;
      cookies[key] = `next-auth.session-token=${jwt.sign({ id: u.id, name: key, email: u.email }, SECRET, { expiresIn: "1h" })}`;
    }
    const trip = await db.trip.create({
      data: {
        title: "Чек-лист",
        destination: "Рим",
        startDate: new Date("2026-11-20T00:00:00.000Z"),
        totalDays: 3,
        members: { create: [{ userId: ids.owner, role: "owner", displayName: "owner" }, { userId: ids.viewer, role: "viewer", displayName: "viewer" }] },
      },
    });
    tripId = trip.id;
  });

  afterAll(async () => {
    await db?.trip.deleteMany({ where: { id: tripId } });
    await db?.user.deleteMany({ where: { email: { endsWith: "@checklist.test" } } });
    await db?.$disconnect();
  });

  it("один пункт: прежний контракт", async () => {
    const res = await post("owner", { tripId, text: "  Паспорт  ", category: "documents" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ text: "Паспорт", category: "documents", order: 0 });
  });

  it("пачка из шаблонов получает порядок подряд внутри каждой категории", async () => {
    const res = await post("owner", {
      tripId,
      items: [
        { text: "Виза", category: "documents" },
        { text: "Билеты", category: "documents" },
        { text: "Аптечка", category: "health" },
      ],
    });
    expect(res.status).toBe(200);
    const rows = await db.checklistItem.findMany({ where: { tripId }, orderBy: [{ category: "asc" }, { order: "asc" }] });
    expect(rows.map((r) => [r.text, r.order])).toEqual([
      ["Паспорт", 0],
      ["Виза", 1],
      ["Билеты", 2],
      ["Аптечка", 0],
    ]);
  });

  it("негодный пункт отклоняет всю пачку", async () => {
    const before = await db.checklistItem.count({ where: { tripId } });
    const res = await post("owner", { tripId, items: [{ text: "Норм", category: "other" }, { text: "   " }] });
    expect(res.status).toBe(400);
    expect(await db.checklistItem.count({ where: { tripId } })).toBe(before);
  });

  it("слишком большая пачка и не строка отклоняются", async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ text: `п${i}` }));
    expect((await post("owner", { tripId, items: many })).status).toBe(400);
    expect((await post("owner", { tripId, text: 5 })).status).toBe(400);
  });

  it("зритель не добавляет", async () => {
    expect((await post("viewer", { tripId, text: "Нельзя" })).status).toBe(403);
  });
});
