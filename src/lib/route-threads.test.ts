import { describe, it, expect } from "vitest";
import { buildRouteThreads, type RouteThreadInput } from "./route-threads";
import type { Day, Place } from "./types";

let seq = 0;
function place(over: Partial<Place>): Place {
  return {
    id: `p${++seq}`,
    name: "Место",
    description: null,
    category: "sight",
    lat: 1,
    lng: 2,
    dayId: "d1",
    timeOfDay: null,
    status: "planned",
    budget: null,
    address: null,
    notes: null,
    rating: null,
    visitedAt: null,
    order: 0,
    ...over,
  };
}
function day(over: Partial<Day>): Day {
  return {
    id: "d1",
    dayNumber: 1,
    date: "2026-09-10",
    city: "Город",
    cityKey: "guangzhou",
    title: "День 1",
    summary: null,
    accentColor: null,
    places: [],
    photos: [],
    ...over,
  };
}

describe("buildRouteThreads", () => {
  it("сортирует места дня по TimeOfDay, безвременные — между днём и вечером", () => {
    const d = day({});
    const m = place({ id: "m", timeOfDay: "morning" });
    const e = place({ id: "e", timeOfDay: "evening" });
    const none = place({ id: "n" });
    const a = place({ id: "a", timeOfDay: "afternoon" });
    const segments = buildRouteThreads(
      [e, none, a, m].map((p) => ({ place: p, day: d }))
    );
    // линия: m → a → n → e
    expect(segments.map((s) => [s.a.id, s.b.id])).toEqual([
      ["m", "a"],
      ["a", "n"],
      ["n", "e"],
    ]);
  });

  it("done только когда оба конца посещены; иначе пунктирный сегмент", () => {
    const d = day({});
    const v1 = place({ id: "v1", status: "visited" });
    const v2 = place({ id: "v2", status: "visited" });
    const p1 = place({ id: "p1", status: "planned" });
    const segments = buildRouteThreads([
      { place: v1, day: d },
      { place: v2, day: d },
      { place: p1, day: d },
    ]);
    expect(segments[0].done).toBe(true);
    expect(segments[1].done).toBe(false);
  });

  it("isToday и цвет — от дня; кастомный accentColor уважается", () => {
    const today = day({ id: "t", dayNumber: 3, accentColor: "#123456" });
    const other = day({ id: "o", dayNumber: 1 });
    const p1 = place({ id: "1" });
    const p2 = place({ id: "2" });
    const segments = buildRouteThreads(
      [
        { place: p1, day: today },
        { place: p2, day: today },
        { place: place({ id: "3" }), day: other },
        { place: place({ id: "4" }), day: other },
      ],
      3
    );
    expect(segments.filter((s) => s.isToday).map((s) => s.dayId)).toEqual(["t"]);
    expect(segments[0].color).toBe("#123456");
    expect(segments[2].color).toBe("#f97316"); // дефолт
  });

  it("одиночное место дня не даёт сегментов", () => {
    const d = day({});
    expect(buildRouteThreads([{ place: place({}), day: d }])).toEqual([]);
  });
});
