import { describe, it, expect } from "vitest";
import {
  TIME_SLOTS,
  timeSortRank,
  timeLabel,
  timeIconKey,
  daySections,
} from "./time-of-day";
import type { Place } from "./types";

const place = (over: Partial<Place>): Place =>
  ({
    id: "p1",
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
  }) as Place;

describe("TIME_SLOTS", () => {
  it("канонический порядок: morning → afternoon → evening", () => {
    expect(TIME_SLOTS.map((s) => s.key)).toEqual(["morning", "afternoon", "evening"]);
  });
});

describe("timeSortRank", () => {
  it("слоты идут по порядку таблицы", () => {
    expect(timeSortRank("morning")).toBeLessThan(timeSortRank("afternoon"));
    expect(timeSortRank("afternoon")).toBeLessThan(timeSortRank("evening"));
  });

  it("пустой и неизвестный слот — между днём и вечером (1.5, историческое поведение карты)", () => {
    expect(timeSortRank(null)).toBe(1.5);
    expect(timeSortRank(undefined)).toBe(1.5);
    expect(timeSortRank("")).toBe(1.5);
    expect(timeSortRank("night")).toBe(1.5);
  });
});

describe("timeLabel", () => {
  it("plain-вариант", () => {
    expect(timeLabel("morning")).toBe("Утро");
    expect(timeLabel("evening")).toBe("Вечер");
  });

  it("emoji-вариант", () => {
    expect(timeLabel("afternoon", { emoji: true })).toBe("☀️ День");
  });

  it("fallback: по умолчанию пустая строка, опционально — своя", () => {
    expect(timeLabel("night")).toBe("");
    expect(timeLabel(null)).toBe("");
    expect(timeLabel("night", { emoji: true, fallback: "Весь день" })).toBe("Весь день");
  });
});

describe("timeIconKey", () => {
  it("маппинг иконок и null на неизвестном", () => {
    expect(timeIconKey("morning")).toBe("sunrise");
    expect(timeIconKey("afternoon")).toBe("sun");
    expect(timeIconKey("evening")).toBe("moon");
    expect(timeIconKey("night")).toBeNull();
  });
});

describe("daySections", () => {
  it("без timeOfDay — одна секция 'all' без заголовка", () => {
    const sections = daySections([place({}), place({ id: "p2" })]);
    expect(sections).toEqual([{ key: "all", label: "", places: sections[0].places }]);
    expect(sections[0].places).toHaveLength(2);
  });

  it("смешанный день: слоты по порядку, места без слота — в 'other' в конце", () => {
    const places = [
      place({ id: "e1", timeOfDay: "evening" }),
      place({ id: "m1", timeOfDay: "morning" }),
      place({ id: "none" }),
      place({ id: "a1", timeOfDay: "afternoon" }),
    ];
    const sections = daySections(places);
    expect(sections.map((s) => s.key)).toEqual(["morning", "afternoon", "evening", "other"]);
    expect(sections[3].label).toBe("Без времени");
    expect(sections[0].places.map((p) => p.id)).toEqual(["m1"]);
  });

  it("пустые слоты не дают пустых секций", () => {
    const sections = daySections([place({ timeOfDay: "evening" })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("evening");
  });
});
