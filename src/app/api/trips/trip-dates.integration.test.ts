// Интеграционный прогон дат и поясов на настоящем Postgres: создание поездки из шаблона, смена дат,
// пояс пользователя и окно автонапоминаний. База и запуск те же, что у API «Сочтёмся»:
//   SPLIT_TEST_DATABASE_URL=postgresql://… bunx vitest run src/app/api/trips
// Без переменной набор пропускается.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { tripRangeKeys } from "@/lib/trip-days";

const URL_ENV = process.env.SPLIT_TEST_DATABASE_URL;

describe.skipIf(!URL_ENV)("даты поездки и пояс пользователя (Postgres)", () => {
  let db: typeof import("@/lib/db").db;
  let templateRoute: typeof import("./from-template/route");
  let tripsRoute: typeof import("./route");
  let datesRoute: typeof import("../trip/dates/route");
  let userRoute: typeof import("../user/route");
  let reminders: typeof import("@/lib/split/reminders-server");
  const SECRET = randomBytes(32).toString("hex");
  const stamp = Date.now();
  let userId = "";
  let cookie = "";

  const req = (path: string, method: string, body: unknown) =>
    new NextRequest(`http://localhost/api${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_ENV!;
    process.env.NEXTAUTH_SECRET = SECRET;
    ({ db } = await import("@/lib/db"));
    templateRoute = await import("./from-template/route");
    tripsRoute = await import("./route");
    datesRoute = await import("../trip/dates/route");
    userRoute = await import("../user/route");
    reminders = await import("@/lib/split/reminders-server");
    const u = await db.user.create({ data: { email: `dates-${stamp}@tz.test`, name: "Даты", password: "x", plan: "premium" } });
    userId = u.id;
    cookie = `next-auth.session-token=${jwt.sign({ id: u.id, name: u.name, email: u.email }, SECRET, { expiresIn: "1h" })}`;
  });

  afterAll(async () => {
    await db?.tripMember.deleteMany({ where: { userId } });
    await db?.user.deleteMany({ where: { email: { endsWith: "@tz.test" } } });
    await db?.$disconnect();
  });

  it("поездка из шаблона заканчивается в свой последний день", async () => {
    const res = await templateRoute.POST(req("/trips/from-template", "POST", { templateId: "japan-tokyo", startDate: "2026-10-08" }));
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    const trip = await db.trip.findUniqueOrThrow({ where: { id }, include: { days: { orderBy: { dayNumber: "asc" } } } });
    const { startKey, lastKey } = tripRangeKeys(trip);
    expect(startKey).toBe("2026-10-08");
    expect(trip.days).toHaveLength(trip.totalDays);
    expect(trip.days.at(-1)!.date.toISOString().slice(0, 10)).toBe(lastKey);
    expect(trip.endDate!.toISOString()).toBe(`${lastKey}T23:59:59.999Z`);
    expect(trip.startDate.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });

  it("смена дат хранит календарные дни и пересчитывает длину", async () => {
    const res = await tripsRoute.POST(req("/trips", "POST", { title: "Обычная", destination: "Рим", startDate: "2026-11-05", totalDays: 3 }));
    const { id } = (await res.json()) as { id: string };
    const created = await db.trip.findUniqueOrThrow({ where: { id } });
    expect(created.startDate.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(created.endDate!.toISOString()).toBe("2026-11-07T23:59:59.999Z");

    const patched = await datesRoute.PATCH(req("/trip/dates", "PATCH", { tripId: id, startDate: "2026-11-10", endDate: "2026-11-14" }));
    expect(patched.status).toBe(200);
    const trip = await db.trip.findUniqueOrThrow({ where: { id }, include: { days: { orderBy: { dayNumber: "asc" } } } });
    expect(trip.totalDays).toBe(5);
    expect(trip.days.map((d) => d.date.toISOString().slice(0, 10))).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(trip.endDate!.toISOString()).toBe("2026-11-14T23:59:59.999Z");
  });

  it("пояс устройства сохраняется, мусор отклоняется", async () => {
    const ok = await userRoute.PATCH(req("/user", "PATCH", { timeZone: "Asia/Shanghai" }));
    expect(ok.status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).timeZone).toBe("Asia/Shanghai");
    const bad = await userRoute.PATCH(req("/user", "PATCH", { timeZone: "Марс/Купол" }));
    expect(bad.status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).timeZone).toBe("Asia/Shanghai");
  });

  describe("окно автонапоминаний", () => {
    let groupId = "";
    let debtorId = "";

    beforeAll(async () => {
      const creditor = await db.user.create({ data: { email: `creditor-${stamp}@tz.test`, name: "Кредитор", password: "x" } });
      const old = new Date("2026-10-01T10:00:00.000Z");
      const group = await db.splitGroup.create({
        data: {
          name: "Поездка",
          currency: "USD",
          remindAfterDays: 3,
          inviteCode: `tz${stamp}`.slice(0, 16),
          members: {
            create: [
              { userId: creditor.id, displayName: "Кредитор", role: "owner" },
              { userId, displayName: "Должник", role: "member" },
            ],
          },
        },
        include: { members: true },
      });
      groupId = group.id;
      const [payer, debtor] = [group.members.find((m) => m.userId === creditor.id)!, group.members.find((m) => m.userId === userId)!];
      debtorId = debtor.id;
      await db.splitExpense.create({
        data: {
          groupId,
          description: "Ужин",
          amountCents: 2000,
          category: "food",
          paidById: payer.id,
          spentOn: old,
          createdAt: old,
          createdById: payer.id,
          shares: { create: [{ memberId: debtor.id, cents: 1000 }, { memberId: payer.id, cents: 1000 }] },
        },
      });
    });

    const remindersToDebtor = () => db.splitReminder.count({ where: { groupId, fromId: debtorId } });

    it("ночью по часам должника молчим, даже если в Минске день", async () => {
      await db.user.update({ where: { id: userId }, data: { timeZone: "Asia/Shanghai" } });
      // 18:30 UTC: в Шанхае 02:30
      await reminders.runSplitReminders(new Date("2026-10-24T18:30:00.000Z"));
      expect(await remindersToDebtor()).toBe(0);
    });

    it("днём по часам должника напоминаем, даже если в Минске ещё ночь", async () => {
      // 02:30 UTC: в Шанхае 10:30, в Минске 05:30
      await reminders.runSplitReminders(new Date("2026-10-25T02:30:00.000Z"));
      expect(await remindersToDebtor()).toBe(1);
    });
  });
});
