import { describe, it, expect } from "vitest";
import { draftFromPlace, diffPlaceDraft, parseBudget, type PlaceDraft } from "./place-draft";
import type { Place } from "./types";

const place = (over: Partial<Place>): Place =>
  ({
    id: "p1",
    name: "Музей",
    description: "Интересно",
    category: "sight",
    lat: 1,
    lng: 2,
    dayId: "d1",
    timeOfDay: "morning",
    status: "planned",
    budget: 25,
    address: "Улица 1",
    notes: null,
    rating: null,
    visitedAt: null,
    order: 0,
    ...over,
  }) as Place;

const draft = (over: Partial<PlaceDraft>): PlaceDraft => ({
  name: "Музей",
  category: "sight",
  timeOfDay: "morning",
  budget: "25",
  address: "Улица 1",
  description: "Интересно",
  dayId: "d1",
  ...over,
});

describe("parseBudget", () => {
  it("строка → число|null", () => {
    expect(parseBudget("25")).toBe(25);
    expect(parseBudget(" 12.5 ")).toBe(12.5);
    expect(parseBudget("")).toBeNull();
    expect(parseBudget("abc")).toBeNull();
  });
});

describe("draftFromPlace", () => {
  it("переносит поля места в строковую форму ввода", () => {
    const d = draftFromPlace(place({ budget: null, timeOfDay: null }));
    expect(d).toEqual(draft({ budget: "", timeOfDay: "" }));
  });
});

describe("diffPlaceDraft", () => {
  it("нет изменений — пустой патч", () => {
    expect(diffPlaceDraft(draft({}), draft({}))).toEqual({});
  });

  it("изменения собираются в готовое тело PATCH (включая сбросы в null)", () => {
    const patch = diffPlaceDraft(
      draft({}),
      draft({ name: "  Новый музей ", timeOfDay: "", budget: "", address: "  ", description: "" })
    );
    expect(patch).toEqual({
      name: "Новый музей",
      timeOfDay: null,
      budget: null,
      address: null,
      description: null,
    });
  });

  it("бюджет сравнивается по числу, а не по строке («25.0» == 25)", () => {
    expect(diffPlaceDraft(draft({ budget: "25" }), draft({ budget: "25.0" }))).toEqual({});
    expect(diffPlaceDraft(draft({ budget: "25" }), draft({ budget: "30" }))).toEqual({ budget: 30 });
  });

  it("день не часть диффа (перенос дня — отдельная мутация)", () => {
    expect(diffPlaceDraft(draft({}), draft({ dayId: "d2" }))).toEqual({});
  });
});
