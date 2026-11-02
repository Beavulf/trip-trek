import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateCurrentDayNumber,
  dayDateFor,
  dayEndFor,
  buildInitialDays,
  MAX_INITIAL_DAYS,
  dayIdForDate,
  isTripFinished,
  isTripOver,
  tripDaysElapsed,
  daysLeftInTrip,
  isBeforeTripStart,
  tripDateKey,
  tripRangeKeys,
  formatTripDate,
  trustedTodayKey,
} from "./trip-days";

afterEach(() => {
  vi.useRealTimers();
});

/** Время по часам устройства: без Z строка читается как местная, и тест верен в любом поясе */
const deviceTime = (iso: string) => new Date(iso.replace(/Z$/, ""));

describe("calculateCurrentDayNumber", () => {
  // Функция берёт день по часам устройства; тесты идут в UTC, поэтому время задано в UTC.
  const fakeNow = (iso: string) => vi.setSystemTime(deviceTime(iso));

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
  // Календарные дни хранятся в UTC и не зависят от пояса процесса
  const start = new Date("2026-09-10T18:45:00.000Z"); // вечер — время должно обнуляться

  it("день 1 совпадает с датой старта в полночь UTC", () => {
    expect(dayDateFor(start, 1).toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("день N = старт + (N−1) суток", () => {
    expect(dayDateFor(start, 3).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("переход через месяц", () => {
    expect(dayDateFor(start, 25).toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("не мутирует переданный startDate", () => {
    const before = start.getTime();
    dayDateFor(start, 5);
    expect(start.getTime()).toBe(before);
  });

  it("dayEndFor — 23:59:59.999 того же дня", () => {
    expect(dayEndFor(start, 2).toISOString()).toBe("2026-09-11T23:59:59.999Z");
  });
});

describe("календарные дни поездки в любом поясе", () => {
  // Набор идёт и в других поясах: bun run test:tz
  const start = "2026-10-08T00:00:00.000Z";
  const end = "2026-10-19T23:59:59.999Z";

  it("formatTripDate показывает выбранный день, а не день в поясе устройства", () => {
    expect(formatTripDate(start)).toBe("8 окт.");
    expect(formatTripDate(end)).toBe("19 окт.");
    expect(formatTripDate(end, { day: "numeric", month: "long" })).toBe("19 октября");
    expect(formatTripDate("2026-10-19")).toBe("19 окт.");
    expect(formatTripDate(end, { day: "2-digit", month: "2-digit", year: "numeric" })).toBe("19.10.2026");
  });

  it("dayDateFor и dayEndFor не зависят от пояса процесса", () => {
    expect(dayDateFor(new Date(start), 3).toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(dayEndFor(new Date(start), 12).toISOString()).toBe(end);
    // Старт из старых шаблонов лежит в полдень: день тот же
    expect(dayDateFor(new Date("2026-10-08T12:00:00.000Z"), 1).toISOString()).toBe(start);
  });

  it("первый и последний день поездки читаются без сдвига", () => {
    expect(tripRangeKeys({ startDate: start, endDate: end, totalDays: 12 })).toEqual({ startKey: "2026-10-08", lastKey: "2026-10-19" });
  });

  it("поездка заканчивается по последнему календарному дню, в любом поясе", () => {
    expect(isTripOver(end, new Date(2026, 9, 19, 23, 30))).toBe(false);
    expect(isTripOver(end, new Date(2026, 9, 20, 0, 30))).toBe(true);
    expect(calculateCurrentDayNumber(start, 12, new Date(2026, 9, 7, 23, 30))).toBe(0);
    expect(calculateCurrentDayNumber(start, 12, new Date(2026, 9, 8, 0, 30))).toBe(1);
  });

  it("trustedTodayKey верит устройству только в пределах суток", () => {
    const now = new Date("2026-10-08T22:00:00.000Z");
    expect(trustedTodayKey("2026-10-09", now)).toBe("2026-10-09");
    expect(trustedTodayKey("2026-10-07", now)).toBe("2026-10-07");
    expect(trustedTodayKey("2026-10-20", now)).toBe("2026-10-08");
    expect(trustedTodayKey("2026-02-31", now)).toBe("2026-10-08");
    expect(trustedTodayKey(undefined, now)).toBe("2026-10-08");
    expect(trustedTodayKey(20261008, now)).toBe("2026-10-08");
  });
});

describe("dayIdForDate / isTripFinished", () => {
  it("dayIdForDate находит день по дате и игнорирует время", () => {
    // Дни в БД — полночь UTC, снимок — часы устройства: в Америке день уезжал на сутки назад
    const days = [
      { id: "d1", date: "2026-10-08T00:00:00.000Z" },
      { id: "d2", date: "2026-10-09T00:00:00.000Z" },
    ];
    expect(dayIdForDate(days, new Date(2026, 9, 8, 15, 0))).toBe("d1");
    expect(dayIdForDate(days, new Date(2026, 9, 9, 22, 15))).toBe("d2");
    expect(dayIdForDate(days, new Date(2026, 9, 9, 0, 30))).toBe("d2");
    expect(dayIdForDate(days, new Date(2026, 9, 1))).toBeNull();
  });

  it("isTripFinished: endDate прошёл и не completed", () => {
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0));
    const end = "2026-10-20T23:59:59.999Z";
    expect(isTripFinished(end, "planning")).toBe(true);
    expect(isTripFinished(end, "active")).toBe(true);
    // закрытая поездка больше не «незакрытая», даже если endDate прошёл
    expect(isTripFinished(end, "completed")).toBe(false);
    // ещё едем
    expect(isTripFinished("2026-10-25T23:59:59.999Z", "active")).toBe(false);
    // без конца (totalDays-only) финал не наступает — конец вычисляется на клиенте
    expect(isTripFinished(null, "planning")).toBe(false);
  });

  it("isTripOver: гасит «сегодня» после финиша независимо от статуса", () => {
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0));
    expect(isTripOver("2026-10-20T23:59:59.999Z")).toBe(true);
    expect(isTripOver("2026-10-25T23:59:59.999Z")).toBe(false);
    expect(isTripOver(null)).toBe(false);
  });

  it("isTripOver: последний день длится до полуночи устройства, а не до полуночи UTC", () => {
    const end = "2026-10-20T23:59:59.999Z";
    expect(isTripOver(end, new Date(2026, 9, 20, 23, 30))).toBe(false);
    expect(isTripOver(end, new Date(2026, 9, 21, 0, 5))).toBe(true);
  });
});

describe("daysLeftInTrip (единая формула с номером дня)", () => {
  const start = new Date("2026-09-10T00:00:00Z");
  const at = deviceTime;

  it("до старта — все дни", () => {
    expect(daysLeftInTrip(start, 7, "planning", at("2026-09-08T12:00:00Z"))).toBe(7);
  });
  it("в первый день — все дни, в последний — 1", () => {
    expect(daysLeftInTrip(start, 7, "active", at("2026-09-10T08:00:00Z"))).toBe(7);
    expect(daysLeftInTrip(start, 7, "active", at("2026-09-16T23:00:00Z"))).toBe(1);
  });
  it("после финиша и у завершённой — null", () => {
    expect(daysLeftInTrip(start, 7, "active", at("2026-09-17T00:00:00Z"))).toBeNull();
    expect(daysLeftInTrip(start, 7, "completed", at("2026-09-12T12:00:00Z"))).toBeNull();
    expect(daysLeftInTrip(start, 0, "active", at("2026-09-12T12:00:00Z"))).toBeNull();
  });
  it("согласован с calculateCurrentDayNumber: осталось = totalDays − день + 1", () => {
    for (const iso of ["2026-09-10T01:00:00Z", "2026-09-13T12:00:00Z", "2026-09-16T23:59:00Z"]) {
      vi.setSystemTime(deviceTime(iso));
      const day = calculateCurrentDayNumber(start, 7);
      expect(daysLeftInTrip(start, 7, "active", deviceTime(iso))).toBe(7 - day + 1);
    }
  });
  it("tripDaysElapsed: отрицательное до старта, без клампа после", () => {
    expect(tripDaysElapsed(start, at("2026-09-08T12:00:00Z"))).toBe(-2);
    expect(tripDaysElapsed(start, at("2026-10-01T12:00:00Z"))).toBe(21);
  });
});

describe("день поездки считается по часам устройства", () => {
  const start = "2026-10-08T00:00:00.000Z";

  // Даты заданы локальными компонентами: тест верен в любом поясе и особенно важен при TZ=Asia/Shanghai
  it("сразу после местной полуночи уже новый день", () => {
    expect(calculateCurrentDayNumber(start, 13, new Date(2026, 9, 11, 0, 30))).toBe(4);
    expect(calculateCurrentDayNumber(start, 13, new Date(2026, 9, 11, 7, 30))).toBe(4);
    expect(calculateCurrentDayNumber(start, 13, new Date(2026, 9, 10, 23, 30))).toBe(3);
  });

  it("первый день начинается в местную полночь", () => {
    expect(calculateCurrentDayNumber(start, 13, new Date(2026, 9, 7, 23, 59))).toBe(0);
    expect(calculateCurrentDayNumber(start, 13, new Date(2026, 9, 8, 0, 1))).toBe(1);
  });

  it("tripRangeKeys читает дни из самих дат, а конец поездки не уезжает на сутки", () => {
    expect(tripRangeKeys({ startDate: start, endDate: "2026-10-20T23:59:59.999Z", totalDays: 13 })).toEqual({
      startKey: "2026-10-08",
      lastKey: "2026-10-20",
    });
    expect(tripRangeKeys({ startDate: start, endDate: null, totalDays: 13 }).lastKey).toBe("2026-10-20");
  });

  it("tripDateKey не зависит от пояса устройства", () => {
    expect(tripDateKey("2026-10-08T00:00:00.000Z")).toBe("2026-10-08");
    expect(tripDateKey(new Date("2026-10-20T23:59:59.999Z"))).toBe("2026-10-20");
  });
});

describe("isBeforeTripStart", () => {
  const start = "2026-03-01T00:00:00.000Z";
  // Время траты задаём локальными компонентами — результат не зависит от пояса машины с тестами
  it("в день старта в любое время суток — уже не «до поездки» (раньше UTC+8 в 06:00 попадал в «до»)", () => {
    expect(isBeforeTripStart(new Date(2026, 2, 1, 6, 0), start)).toBe(false);
    expect(isBeforeTripStart(new Date(2026, 2, 1, 0, 5), start)).toBe(false);
    expect(isBeforeTripStart(new Date(2026, 2, 1, 23, 59), start)).toBe(false);
  });
  it("накануне старта — до поездки", () => {
    expect(isBeforeTripStart(new Date(2026, 1, 28, 23, 59), start)).toBe(true);
    expect(isBeforeTripStart(new Date(2025, 11, 31, 12, 0), start)).toBe(true);
  });
  it("после старта — нет", () => {
    expect(isBeforeTripStart(new Date(2026, 2, 5, 12, 0), start)).toBe(false);
  });
});

describe("buildInitialDays", () => {
  const start = new Date(2026, 9, 24); // 24 октября 2026, локальная полночь

  it("создаёт N дней подряд: номера, названия, даты от старта", () => {
    const days = buildInitialDays(start, 3, "Токио");
    expect(days.map((d) => d.dayNumber)).toEqual([1, 2, 3]);
    expect(days.map((d) => d.title)).toEqual(["День 1", "День 2", "День 3"]);
    expect(days[0].date.getTime()).toBe(dayDateFor(start, 1).getTime());
    expect(days[2].date.getTime()).toBe(dayDateFor(start, 3).getTime());
    expect(days.every((d) => d.city === "Токио" && d.cityKey === "custom")).toBe(true);
  });

  it("число дней зажато в [1, MAX_INITIAL_DAYS]; мусор даёт один день", () => {
    expect(buildInitialDays(start, 0, "X")).toHaveLength(1);
    expect(buildInitialDays(start, -5, "X")).toHaveLength(1);
    expect(buildInitialDays(start, Number.NaN, "X")).toHaveLength(1);
    expect(buildInitialDays(start, 9999, "X")).toHaveLength(MAX_INITIAL_DAYS);
    expect(buildInitialDays(start, 12.9, "X")).toHaveLength(12);
  });

  it("пустое направление не даёт пустой город", () => {
    expect(buildInitialDays(start, 1, "  ")[0].city).toBe("Направление");
  });
});
