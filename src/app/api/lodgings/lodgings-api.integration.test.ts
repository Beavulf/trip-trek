// Интеграционный прогон жилья на настоящем Postgres: перенос отелей из маршрута, связь мест с жильём,
// права. База и запуск те же, что у API «Сочтёмся» (шапка split-api.integration.test.ts):
//   SPLIT_TEST_DATABASE_URL=postgresql://… bunx vitest run src/app/api/lodgings
// Без переменной набор пропускается.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { calculateLodgingPlan, calculateRoutePlanByExpenseCategory } from "@/lib/budget";
import { proposeStays, type RouteDayInput } from "@/lib/lodging-import";
import type { Day } from "@/lib/types";

const URL_ENV = process.env.SPLIT_TEST_DATABASE_URL;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!URL_ENV)("API жилья (Postgres)", () => {
  let db: typeof import("@/lib/db").db;
  let lodgingsRoute: typeof import("./route");
  let importRoute: typeof import("./import/route");
  let backupRoute: typeof import("../trip/import/route");
  const SECRET = randomBytes(32).toString("hex");
  const users: Record<string, { id: string; cookie: string }> = {};
  let tripId = "";
  let otherTripId = "";
  let otherPlaceId = "";
  const placeIds: Record<string, string> = {};

  const req = (path: string, who: string, init: { method?: string; body?: unknown } = {}) =>
    new NextRequest(`http://localhost/api/lodgings${path}`, {
      method: init.method ?? "POST",
      headers: { cookie: users[who].cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const routeDays = async () =>
    db.day.findMany({
      where: { tripId },
      orderBy: { dayNumber: "asc" },
      select: {
        dayNumber: true,
        date: true,
        city: true,
        places: {
          where: { tripId },
          select: { id: true, name: true, category: true, lat: true, lng: true, address: true, budget: true, timeOfDay: true, lodgingId: true },
        },
      },
    });
  const asRouteDays = (days: Awaited<ReturnType<typeof routeDays>>): RouteDayInput[] =>
    days.map((d) => ({ ...d, date: d.date.toISOString() }));
  const planOf = async () => calculateRoutePlanByExpenseCategory((await routeDays()) as unknown as Day[]);

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_ENV!;
    process.env.NEXTAUTH_SECRET = SECRET;
    ({ db } = await import("@/lib/db"));
    lodgingsRoute = await import("./route");
    importRoute = await import("./import/route");
    backupRoute = await import("../trip/import/route");

    for (const key of ["owner", "viewer", "stranger"]) {
      const u = await db.user.create({ data: { email: `${key}-${Date.now()}@lodging.test`, name: key, password: "x", emoji: "🦊", color: "#10b981" } });
      users[key] = { id: u.id, cookie: `next-auth.session-token=${jwt.sign({ id: u.id, name: key, email: u.email }, SECRET, { algorithm: "HS256" })}` };
    }

    const makeTrip = async (ownerKey: string) => {
      const trip = await db.trip.create({
        data: {
          title: "Китай",
          destination: "Китай",
          startDate: new Date("2026-10-08T00:00:00.000Z"),
          endDate: new Date("2026-10-13T23:59:59.999Z"),
          totalDays: 6,
          members: { create: [{ userId: users[ownerKey].id, role: "owner", displayName: ownerKey }] },
        },
      });
      return trip.id;
    };
    tripId = await makeTrip("owner");
    await db.tripMember.create({ data: { tripId, userId: users.viewer.id, role: "viewer", displayName: "viewer" } });
    otherTripId = await makeTrip("stranger");

    const addDay = (trip: string, n: number) =>
      db.day.create({ data: { tripId: trip, dayNumber: n, date: new Date(Date.UTC(2026, 9, 7 + n)), city: "Гуанчжоу", cityKey: "custom", title: `День ${n}` } });
    const addPlace = (trip: string, dayId: string, name: string, lat: number, budget: number | null, timeOfDay: string) =>
      db.place.create({ data: { tripId: trip, dayId, name, category: "hotel", lat, lng: 113.4, budget, timeOfDay, address: `${name}, улица` } });

    const d1 = await addDay(tripId, 1);
    const d4 = await addDay(tripId, 4);
    placeIds.checkIn = (await addPlace(tripId, d1.id, "River Hotel", 23.1, 177, "morning")).id;
    placeIds.checkOut = (await db.place.create({ data: { tripId, dayId: d4.id, name: "ВЫСЕЛЕНИЕ", category: "hotel", lat: 23.1, lng: 113.4, timeOfDay: "morning" } })).id;
    placeIds.next = (await addPlace(tripId, d4.id, "Bay Inn", 22.5, 15, "afternoon")).id;
    otherPlaceId = (await addPlace(otherTripId, (await addDay(otherTripId, 1)).id, "Чужой", 40, 10, "morning")).id;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: { in: [tripId, otherTripId] } } });
    await db.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
    await db.$disconnect();
  });

  it("предложение из настоящих записей: одно проживание с выселением и одно открытое", async () => {
    const stays = proposeStays(asRouteDays(await routeDays()), [], "2026-10-13");
    expect(stays.map((s) => [s.name, s.checkIn, s.checkOut, s.price])).toEqual([
      ["River Hotel", "2026-10-08", "2026-10-11", 177],
      ["Bay Inn", "2026-10-11", "2026-10-13", 15],
    ]);
  });

  it("зритель и посторонний не переносят", async () => {
    const body = { tripId, stays: [{ placeIds: [placeIds.next], name: "X", checkIn: "2026-10-11", checkOut: "2026-10-13" }] };
    expect((await importRoute.POST(req("/import", "viewer", { body }))).status).toBe(403);
    expect((await importRoute.POST(req("/import", "stranger", { body }))).status).toBe(403);
    expect(await db.lodging.count({ where: { tripId } })).toBe(0);
  });

  it("чужое место отклоняется целиком: ничего не создаётся и не привязывается", async () => {
    const res = await importRoute.POST(
      req("/import", "owner", { body: { tripId, stays: [{ placeIds: [placeIds.next, otherPlaceId], name: "X", checkIn: "2026-10-11", checkOut: "2026-10-13" }] } })
    );
    expect(res.status).toBe(409);
    expect(await db.lodging.count({ where: { tripId } })).toBe(0);
    expect((await db.place.findUniqueOrThrow({ where: { id: placeIds.next } })).lodgingId).toBeNull();
  });

  it("битая запись отменяет всю пачку", async () => {
    const res = await importRoute.POST(
      req("/import", "owner", {
        body: {
          tripId,
          stays: [
            { placeIds: [placeIds.checkIn], name: "OK", checkIn: "2026-10-08", checkOut: "2026-10-11" },
            { placeIds: [placeIds.next], name: "", checkIn: "2026-10-11", checkOut: "2026-10-13" },
          ],
        },
      })
    );
    expect(res.status).toBe(400);
    expect(await db.lodging.count({ where: { tripId } })).toBe(0);
  });

  it("одно место в двух проживаниях не принимается", async () => {
    const res = await importRoute.POST(
      req("/import", "owner", {
        body: {
          tripId,
          stays: [
            { placeIds: [placeIds.next], name: "A", checkIn: "2026-10-08", checkOut: "2026-10-09" },
            { placeIds: [placeIds.next], name: "B", checkIn: "2026-10-09", checkOut: "2026-10-10" },
          ],
        },
      })
    );
    expect(res.status).toBe(400);
  });

  it("перенос: сумма плана не меняется, только переезжает в жильё", async () => {
    expect(await planOf()).toEqual({ accommodation: 192 });

    const stays = proposeStays(asRouteDays(await routeDays()), [], "2026-10-13");
    const res = await importRoute.POST(req("/import", "owner", { body: { tripId, stays } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as Json).created).toBe(2);

    const lodgings = await db.lodging.findMany({ where: { tripId } });
    expect(lodgings).toHaveLength(2);
    expect(await planOf()).toEqual({});
    expect(calculateLodgingPlan(lodgings)).toEqual({ accommodation: 192 });

    const links = await db.place.findMany({ where: { tripId }, select: { id: true, lodgingId: true } });
    expect(links.every((p) => p.lodgingId)).toBe(true);
    const byId = new Map(links.map((p) => [p.id, p.lodgingId]));
    expect(byId.get(placeIds.checkIn)).toBe(byId.get(placeIds.checkOut));
    expect(byId.get(placeIds.next)).not.toBe(byId.get(placeIds.checkIn));
  });

  it("повторный перенос невозможен: предложений нет, а прямой запрос отклоняется", async () => {
    expect(proposeStays(asRouteDays(await routeDays()), [], "2026-10-13")).toEqual([]);
    const res = await importRoute.POST(
      req("/import", "owner", { body: { tripId, stays: [{ placeIds: [placeIds.next], name: "X", checkIn: "2026-10-11", checkOut: "2026-10-13" }] } })
    );
    expect(res.status).toBe(409);
  });

  it("удаление жилья снимает связь: бюджет места возвращается в план", async () => {
    const stay = await db.lodging.findFirstOrThrow({ where: { tripId, name: "River Hotel" } });
    const res = await lodgingsRoute.DELETE(req(`?id=${stay.id}`, "owner", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect((await db.place.findUniqueOrThrow({ where: { id: placeIds.checkIn } })).lodgingId).toBeNull();
    expect(await planOf()).toEqual({ accommodation: 177 });
  });

  it("жильё с таким названием уже есть: привязка без дубля и без второй цены", async () => {
    const existing = await db.lodging.create({
      data: { tripId, name: "River Hotel", checkIn: new Date("2026-10-08T12:00:00Z"), checkOut: new Date("2026-10-11T12:00:00Z"), price: 200 },
    });
    const stays = proposeStays(asRouteDays(await routeDays()), [{ id: existing.id, name: "River Hotel" }], "2026-10-13");
    expect(stays).toHaveLength(1);
    expect(stays[0].lodgingId).toBe(existing.id);

    const res = await importRoute.POST(req("/import", "owner", { body: { tripId, stays } }));
    expect(res.status).toBe(200);
    expect(await db.lodging.count({ where: { tripId } })).toBe(2);
    expect(await planOf()).toEqual({});
    expect((await db.place.findUniqueOrThrow({ where: { id: placeIds.checkIn } })).lodgingId).toBe(existing.id);
  });

  it("импорт бэкапа сохраняет связь места с жильём: сумма не считается дважды", async () => {
    const { buildTripExport } = await import("@/lib/trip-export");
    const backup = await buildTripExport(tripId);
    // Импорт создаёт новую поездку: на бесплатном плане его остановил бы лимит поездок
    await db.user.update({ where: { id: users.owner.id }, data: { plan: "premium" } });
    const res = await backupRoute.POST(
      new NextRequest("http://localhost/api/trip/import", {
        method: "POST",
        headers: { cookie: users.owner.cookie, "content-type": "application/json" },
        body: JSON.stringify(backup),
      })
    );
    expect(res.status).toBe(200);
    const created = (await res.json()) as Json;
    const newTripId = created.tripId ?? created.id ?? created.trip?.id;
    const places = await db.place.findMany({ where: { tripId: newTripId, name: "River Hotel" } });
    expect(places).toHaveLength(1);
    expect(places[0].lodgingId).toBeTruthy();
    const linked = await db.lodging.findUniqueOrThrow({ where: { id: places[0].lodgingId! } });
    expect(linked).toMatchObject({ tripId: newTripId, name: "River Hotel", price: 200 });
    await db.trip.delete({ where: { id: newTripId } });
  });

  it("привязка к чужому жилью не проходит", async () => {
    const foreign = await db.lodging.create({
      data: { tripId: otherTripId, name: "Чужое", checkIn: new Date("2026-10-08T12:00:00Z"), checkOut: new Date("2026-10-09T12:00:00Z") },
    });
    await db.place.update({ where: { id: placeIds.next }, data: { lodgingId: null } });
    const res = await importRoute.POST(req("/import", "owner", { body: { tripId, stays: [{ placeIds: [placeIds.next], lodgingId: foreign.id }] } }));
    expect(res.status).toBe(404);
    expect((await db.place.findUniqueOrThrow({ where: { id: placeIds.next } })).lodgingId).toBeNull();
  });
});
