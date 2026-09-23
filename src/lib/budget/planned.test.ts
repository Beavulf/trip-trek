import { describe, it, expect } from "vitest";
import { calculatePlannedRoute, calculateRoutePlanByExpenseCategory, EXPENSE_CATEGORY_BY_PLACE } from "./planned";
import type { Day, Place } from "../types";

const place = (over: Partial<Place>): Place => ({
  id: `p-${Math.random().toString(36).slice(2)}`,
  name: "Место",
  description: null,
  category: "sight",
  lat: 0,
  lng: 0,
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
});

const day = (over: Partial<Day> & { id: string; dayNumber: number }): Day => ({
  date: "2026-10-01",
  city: "Пекин",
  cityKey: "beijing",
  title: `День ${over.dayNumber}`,
  summary: null,
  accentColor: "#f97316",
  places: [],
  photos: [],
  ...over,
});

describe("calculatePlannedRoute (план по маршрутным бюджетам мест)", () => {
  it("суммирует бюджеты мест по дням и делит на участников", () => {
    const days = [
      day({ id: "d1", dayNumber: 1, places: [place({ budget: 100 }), place({ budget: 50.5 }), place({ budget: null })] }),
      day({ id: "d2", dayNumber: 2, places: [place({ budget: 33.33, category: "hotel" })] }),
    ];
    const s = calculatePlannedRoute(days, 3);
    expect(s.total).toBeCloseTo(183.83, 2);
    expect(s.days[0].total).toBeCloseTo(150.5, 2);
    expect(s.days[0].perPerson).toBeCloseTo(150.5 / 3, 2);
    expect(s.days[0].withBudget).toBe(2);
    expect(s.days[0].placesCount).toBe(3);
    expect(s.days[1].total).toBeCloseTo(33.33, 2);
    expect(s.perPerson).toBeCloseTo(183.83 / 3, 2);
    expect(s.unpricedPlaces).toBe(1);
  });

  it("категории суммируются по всем дням и сортируются по убыванию", () => {
    const days = [
      day({ id: "d1", dayNumber: 1, places: [place({ budget: 100, category: "sight" }), place({ budget: 200, category: "hotel" })] }),
      day({ id: "d2", dayNumber: 2, places: [place({ budget: 50, category: "sight" })] }),
    ];
    const s = calculatePlannedRoute(days, 2);
    // По убыванию суммы: hotel (200) впереди sight (150)
    expect(s.categories.map((c) => c.category)).toEqual(["hotel", "sight"]);
    expect(s.categories[1].total).toBeCloseTo(150, 2);
    expect(s.categories[1].count).toBe(2);
    expect(s.categories[1].perPerson).toBeCloseTo(75, 2);
  });

  it("пустой маршрут и нулевые бюджеты не ломают расчёт", () => {
    const s = calculatePlannedRoute([], 2);
    expect(s.total).toBe(0);
    expect(s.days).toEqual([]);
    expect(s.categories).toEqual([]);
    const s2 = calculatePlannedRoute([day({ id: "d1", dayNumber: 1, places: [place({ budget: 0 })] })], 0);
    expect(s2.total).toBe(0);
    expect(s2.perPerson).toBe(0);
    expect(s2.unpricedPlaces).toBe(1); // нулевой бюджет — места без суммы
  });
});

describe("calculateRoutePlanByExpenseCategory (план маршрута в группах План vs Факт)", () => {
  it("категории мест маппятся в категории трат и суммируются", () => {
    const days = [
      day({ id: "d1", dayNumber: 1, places: [
        place({ budget: 100, category: "hotel" }),      // → accommodation
        place({ budget: 50.5, category: "restaurant" }), // → food
        place({ budget: 9.5, category: "cafe" }),        // → food
        place({ budget: 40, category: "temple" }),       // → attractions
        place({ budget: 25, category: "market" }),       // → shopping
        place({ budget: null, category: "hotel" }),      // без суммы — мимо
      ] }),
    ];
    const plan = calculateRoutePlanByExpenseCategory(days);
    expect(plan.accommodation).toBeCloseTo(100, 2);
    expect(plan.food).toBeCloseTo(60, 2);
    expect(plan.attractions).toBeCloseTo(40, 2);
    expect(plan.shopping).toBeCloseTo(25, 2);
    expect(Object.keys(plan)).toEqual(["accommodation", "food", "attractions", "shopping"]);
  });

  it("неизвестная категория места попадает в «Прочее», транспорт и казино — напрямую", () => {
    const days = [
      day({ id: "d1", dayNumber: 1, places: [
        place({ budget: 10, category: "hoverbike" }), // неизвестная → other
        place({ budget: 20, category: "transport" }),
        place({ budget: 5, category: "casino" }),
      ] }),
    ];
    const plan = calculateRoutePlanByExpenseCategory(days);
    expect(plan.other).toBeCloseTo(10, 2);
    expect(plan.transport).toBeCloseTo(20, 2);
    expect(plan.casino).toBeCloseTo(5, 2);
  });

  it("маппинг покрывает все известные категории мест", () => {
    for (const cat of Object.keys(CATEGORY_KEYS)) {
      expect(EXPENSE_CATEGORY_BY_PLACE[cat]).toBeTruthy();
    }
  });
});

// Ключи CATEGORY_META без импорта типов (места живут в lib/types)
const CATEGORY_KEYS = {
  sight: 1, temple: 1, viewpoint: 1, beach: 1, market: 1, casino: 1,
  restaurant: 1, cafe: 1, bar: 1, hotel: 1, transport: 1, park: 1,
} as const;
