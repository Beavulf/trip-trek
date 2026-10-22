import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateCurrentDayNumber,
  dayDateFor,
  dayEndFor,
  dayIdForDate,
  isTripFinished,
  isTripOver,
} from "./trip-days";

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

  it("до старта поездки возвращает 0 — «сегодня» ещё нет", () => {
    fakeNow("2026-09-08T12:00:00Z");
    expect(calculateCurrentDayNumber(new Date("2026-09-10T00:00:00Z"), 7)).toBe(0);
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

describe("dayIdForDate / isTripFinished", () => {
  it("dayIdForDate находит день по дате и игнорирует время", () => {
    const days = [
      { id: "d1", date: new Date(2026, 9, 8).toISOString() },
      { id: "d2", date: new Date(2026, 9, 9).toISOString() },
    ];
    expect(dayIdForDate(days, new Date(2026, 9, 9, 22, 15))).toBe("d2");
    expect(dayIdForDate(days, new Date(2026, 9, 1))).toBeNull();
  });

  it("isTripFinished: endDate прошёл и не completed", () => {
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0));
    expect(isTripFinished(new Date(2026, 9, 20, 23, 59), "planning")).toBe(true);
    expect(isTripFinished(new Date(2026, 9, 20, 23, 59), "active")).toBe(true);
    // закрытая поездка больше не «незакрытая», даже если endDate прошёл
    expect(isTripFinished(new Date(2026, 9, 20, 23, 59), "completed")).toBe(false);
    // ещё едем
    expect(isTripFinished(new Date(2026, 9, 25), "active")).toBe(false);
    // без конца (totalDays-only) финал не наступает — конец вычисляется на клиенте
    expect(isTripFinished(null, "planning")).toBe(false);
  });

  it("isTripOver: гасит «сегодня» после финиша независимо от статуса", () => {
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0));
    expect(isTripOver(new Date(2026, 9, 20, 23, 59))).toBe(true);
    expect(isTripOver(new Date(2026, 9, 25))).toBe(false);
    expect(isTripOver(null)).toBe(false);
  });
});
