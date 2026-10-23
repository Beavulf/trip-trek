import { describe, it, expect } from "vitest";
import { recurrenceHint, recurringLine } from "./recurrence-text";

describe("recurrence-text", () => {
  it("подсказка для формы", () => {
    expect(recurrenceHint(5, "2026-10-05", "2026-10-23")).toBe("Каждого месяца 5-го числа · следующая — 5 ноября");
  });

  it("31-е: предупреждаем про короткие месяцы", () => {
    expect(recurrenceHint(31, "2026-10-31", "2026-10-31")).toContain("в последний день");
  });

  it("строка в списке: активный, пауза, закончился", () => {
    const rule = { dayOfMonth: 28, startsOn: "2026-08-01", endsOn: null as string | null, active: true };
    expect(recurringLine(rule, "2026-10-23")).toBe("28-го числа · следующая — 28 октября");
    expect(recurringLine({ ...rule, active: false }, "2026-10-23")).toBe("28-го числа · на паузе");
    expect(recurringLine({ ...rule, endsOn: "2026-10-01" }, "2026-10-23")).toBe("28-го числа · закончилась");
  });
});
