import { describe, it, expect } from "vitest";
import { addMonths, dateToKey, dayLabel, diffDays, isDateKey, keyToDate, localDateKey, monthLabel, monthOf } from "./dates";

describe("dates", () => {
  it("isDateKey: формат и существование дня", () => {
    expect(isDateKey("2026-10-23")).toBe(true);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-1-1")).toBe(false);
    expect(isDateKey(20261023)).toBe(false);
  });

  it("ключ ↔ Date без сдвига дня", () => {
    expect(dateToKey(keyToDate("2026-10-23"))).toBe("2026-10-23");
    expect(dateToKey(keyToDate("2027-01-01"))).toBe("2027-01-01");
  });

  it("localDateKey берёт локальный календарь", () => {
    expect(localDateKey(new Date(2026, 9, 3, 23, 59))).toBe("2026-10-03");
  });

  it("addMonths и monthOf", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", 0)).toBe("2026-10");
    expect(monthOf("2026-10-23")).toBe("2026-10");
  });

  it("diffDays считает календарные сутки", () => {
    expect(diffDays("2026-10-23", "2026-10-23")).toBe(0);
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(diffDays("2026-10-23", "2026-10-20")).toBe(-3);
  });

  it("dayLabel: Сегодня / Вчера / дата, год только чужой", () => {
    expect(dayLabel("2026-10-23", "2026-10-23")).toBe("Сегодня");
    expect(dayLabel("2026-10-22", "2026-10-23")).toBe("Вчера");
    expect(dayLabel("2026-10-12", "2026-10-23")).toBe("12 октября");
    expect(dayLabel("2025-12-31", "2026-10-23")).toMatch(/31 декабря 2025/);
  });

  it("monthLabel: «Октябрь 2026» без «г.»", () => {
    expect(monthLabel("2026-10")).toBe("Октябрь 2026");
  });
});
