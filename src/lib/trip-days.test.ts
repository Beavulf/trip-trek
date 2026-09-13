import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateCurrentDayNumber, dayDateFor, dayEndFor } from "./trip-days";

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateCurrentDayNumber", () => {
  // Функция сравнивает даты по UTC-полуночи, поэтому системное время задаём в UTC.
  const fakeNow = (iso: string) => vi.setSystemTime(new Date(iso));

  it("в первый день поездки возвращает 1", () => {
    fakeNow("2026-09-10T15:00:00Z");
    expect(calculateCurrentDayNumber(new Date("2026-09-10T00:00:00Z"), 7)).toBe(1);
  });

  it("через N суток после старта возвращает N+1", () => {
    fakeNow("2026-09-12T23:00:00Z");
    expect(calculateCurrentDayNumber(new Date("2026-09-10T00:00:00Z"), 7)).toBe(3);
  });

  it("до старта поездки не уходит ниже 1", () => {
    fakeNow("2026-09-08T12:00:00Z");
    expect(calculateCurrentDayNumber(new Date("2026-09-10T00:00:00Z"), 7)).toBe(1);
  });

  it("после конца поездки зажимается последним днём", () => {
    fakeNow("2026-10-01T12:00:00Z");
    expect(calculateCurrentDayNumber(new Date("2026-09-10T00:00:00Z"), 7)).toBe(7);
  });

  // P1 #6: расхождение floor+UTC и ceil+ms давало разные номера дней.
  it("полночь следующего дня уже считает новый день (граница суток)", () => {
    fakeNow("2026-09-11T00:00:00Z");
    expect(calculateCurrentDayNumber(new Date("2026-09-10T00:00:00Z"), 7)).toBe(2);
    fakeNow("2026-09-10T23:59:59.999Z");
    expect(calculateCurrentDayNumber(new Date("2026-09-10T00:00:00Z"), 7)).toBe(1);
  });
});

describe("dayDateFor / dayEndFor", () => {
  // Локальные даты: функции работают в локальной полночи (каноническая формула дней).
  const start = new Date(2026, 8, 10, 18, 45); // 10.09.2026, вечер — время должно обнуляться

  it("день 1 совпадает с датой старта в локальную полночь", () => {
    const d = dayDateFor(start, 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0);
  });

  it("день N = старт + (N−1) суток", () => {
    const d = dayDateFor(start, 3);
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(0);
  });

  it("не мутирует переданный startDate", () => {
    const before = start.getTime();
    dayDateFor(start, 5);
    expect(start.getTime()).toBe(before);
  });

  it("dayEndFor — 23:59:59.999 того же дня", () => {
    const d = dayEndFor(start, 2);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });
});
