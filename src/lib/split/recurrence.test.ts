import { describe, it, expect } from "vitest";
import { duePeriods, nextOccurrence, occurrenceDate, MAX_CATCHUP_PERIODS } from "./recurrence";

const rule = (over: Partial<Parameters<typeof duePeriods>[0]> = {}) => ({
  dayOfMonth: 5,
  startsOn: "2026-08-01",
  endsOn: null as string | null,
  ...over,
});

describe("occurrenceDate", () => {
  it("31-е в коротком месяце — последний день", () => {
    expect(occurrenceDate("2026-02", 31)).toBe("2026-02-28");
    expect(occurrenceDate("2028-02", 30)).toBe("2028-02-29");
    expect(occurrenceDate("2026-04", 31)).toBe("2026-04-30");
    expect(occurrenceDate("2026-10", 31)).toBe("2026-10-31");
  });
});

describe("duePeriods", () => {
  it("все наступившие периоды с месяца начала, будущие не создаёт", () => {
    expect(duePeriods(rule(), "2026-10-23").map((p) => p.date)).toEqual(["2026-08-05", "2026-09-05", "2026-10-05"]);
    expect(duePeriods(rule({ dayOfMonth: 28 }), "2026-10-23").map((p) => p.date)).toEqual(["2026-08-28", "2026-09-28"]);
  });

  it("в день срока трата уже создаётся", () => {
    expect(duePeriods(rule({ startsOn: "2026-10-05" }), "2026-10-05")).toEqual([{ period: "2026-10", date: "2026-10-05" }]);
  });

  it("старт позже числа месяца начала — первый период следующий месяц", () => {
    expect(duePeriods(rule({ startsOn: "2026-08-20" }), "2026-10-23").map((p) => p.period)).toEqual(["2026-09", "2026-10"]);
  });

  it("endsOn обрезает хвост", () => {
    expect(duePeriods(rule({ endsOn: "2026-09-30" }), "2026-10-23").map((p) => p.period)).toEqual(["2026-08", "2026-09"]);
  });

  it("переход через год", () => {
    expect(duePeriods(rule({ startsOn: "2026-11-01", dayOfMonth: 1 }), "2027-01-15").map((p) => p.period)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("не больше MAX_CATCHUP_PERIODS, остаются самые свежие", () => {
    const r = duePeriods(rule({ startsOn: "2020-01-01", dayOfMonth: 1 }), "2026-10-23");
    expect(r).toHaveLength(MAX_CATCHUP_PERIODS);
    expect(r[r.length - 1].period).toBe("2026-10");
  });
});

describe("nextOccurrence", () => {
  it("ближайшая будущая дата", () => {
    expect(nextOccurrence(rule(), "2026-10-23")).toBe("2026-11-05");
    expect(nextOccurrence(rule({ dayOfMonth: 28 }), "2026-10-23")).toBe("2026-10-28");
  });
  it("после endsOn — null", () => {
    expect(nextOccurrence(rule({ endsOn: "2026-10-31" }), "2026-10-23")).toBeNull();
  });
});
