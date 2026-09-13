import { describe, it, expect } from "vitest";
import { PLACE_PATCHABLE, pickPatchablePlace } from "./place-fields";


describe("PLACE_PATCHABLE", () => {
  it("не содержит служебных полей", () => {
    expect(PLACE_PATCHABLE).not.toContain("id");
    expect(PLACE_PATCHABLE).not.toContain("tripId");
    expect(PLACE_PATCHABLE).not.toContain("order");
  });
});

describe("pickPatchablePlace", () => {
  it("отбрасывает неизвестные и запрещённые поля", () => {
    const out = pickPatchablePlace({
      name: "Тест",
      id: "hack",
      tripId: "hack",
      order: 99,
      userName: "злоумышленник",
      unknownField: true,
    });
    expect(out).toEqual({ name: "Тест" });
  });

  it("капы строк как в POST: name 200, description 2000, address 300", () => {
    const out = pickPatchablePlace({
      name: "x".repeat(250),
      description: "y".repeat(2500),
      address: "z".repeat(500),
    });
    expect(out.name).toHaveLength(200);
    expect(out.description).toHaveLength(2000);
    expect(out.address).toHaveLength(300);
  });

  it("пустые строки в nullable-полях → null, а не ''", () => {
    expect(pickPatchablePlace({ address: "", description: "", timeOfDay: "" })).toEqual({
      address: null,
      description: null,
      timeOfDay: null,
    });
    expect(pickPatchablePlace({ name: "   " }).name).toBeUndefined();
  });

  it("null проходит в nullable-поля (сброс значения)", () => {
    expect(pickPatchablePlace({ budget: null, rating: null, timeOfDay: null })).toEqual({
      budget: null,
      rating: null,
      timeOfDay: null,
    });
  });

  it("числа: конечные проходят, NaN/Infinity/строки отбрасываются", () => {
    expect(pickPatchablePlace({ lat: 23.1, lng: 113.2, budget: 0 })).toEqual({ lat: 23.1, lng: 113.2, budget: 0 });
    expect(pickPatchablePlace({ lat: NaN, budget: Infinity, rating: "5" })).toEqual({});
  });

  it("status — только валидные значения enum", () => {
    expect(pickPatchablePlace({ status: "visited" })).toEqual({ status: "visited" });
    expect(pickPatchablePlace({ status: "hacked" })).toEqual({});
  });

  it("visitedAt: ISO-строка → Date, мусор отбрасывается, null проходит", () => {
    const out = pickPatchablePlace({ visitedAt: "2026-09-12T10:00:00Z" });
    expect(out.visitedAt).toBeInstanceOf(Date);
    expect(pickPatchablePlace({ visitedAt: null }).visitedAt).toBeNull();
    expect(pickPatchablePlace({ visitedAt: "garbage" }).visitedAt).toBeUndefined();
  });

  it("не-объект на входе — пустой патч", () => {
    expect(pickPatchablePlace(null)).toEqual({});
    expect(pickPatchablePlace("string")).toEqual({});
    expect(pickPatchablePlace(42)).toEqual({});
  });
});
