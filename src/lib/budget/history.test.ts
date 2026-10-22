import { describe, it, expect } from "vitest";
import { groupByDay, dayLabel } from "./history";

// Время задаём локальными компонентами — результат не зависит от пояса машины с тестами
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0).toISOString();
const item = (createdAt: string, amount: number, category = "food") => ({ createdAt, category, amount });
const NOW = new Date(2026, 9, 22, 15, 0); // 22 октября 2026, 15:00

describe("dayLabel", () => {
  it("сегодня и вчера", () => {
    expect(dayLabel(new Date(2026, 9, 22, 1, 0), NOW)).toBe("Сегодня");
    expect(dayLabel(new Date(2026, 9, 21, 23, 59), NOW)).toBe("Вчера");
  });
  it("прочие дни — число и месяц, год только у чужого года", () => {
    const same = dayLabel(new Date(2026, 9, 5, 10, 0), NOW);
    expect(same).toContain("5");
    expect(same).not.toContain("2026");
    expect(dayLabel(new Date(2025, 11, 31, 10, 0), NOW)).toContain("2025");
  });
  it("граница суток: 00:05 сегодня — ещё «Сегодня», 23:55 вчера — «Вчера»", () => {
    expect(dayLabel(new Date(2026, 9, 22, 0, 5), NOW)).toBe("Сегодня");
    expect(dayLabel(new Date(2026, 9, 21, 23, 55), NOW)).toBe("Вчера");
  });
});

describe("groupByDay", () => {
  it("группирует по локальной дате, сохраняя порядок групп и записей", () => {
    const list = [
      item(at(2026, 10, 22, 14), 10),
      item(at(2026, 10, 22, 9), 5),
      item(at(2026, 10, 21, 20), 30),
    ];
    const groups = groupByDay(list, NOW);
    expect(groups.map((g) => g.label)).toEqual(["Сегодня", "Вчера"]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].items.map((i) => i.amount)).toEqual([10, 5]);
  });

  it("сумма группы — только траты, переводы не входят", () => {
    const groups = groupByDay(
      [item(at(2026, 10, 22), 40), item(at(2026, 10, 22), 100, "settlement"), item(at(2026, 10, 22), 2.5)],
      NOW
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBeCloseTo(42.5, 6);
    expect(groups[0].items).toHaveLength(3);
  });

  it("группа из одних переводов имеет нулевую сумму", () => {
    expect(groupByDay([item(at(2026, 10, 22), 100, "settlement")], NOW)[0].total).toBe(0);
  });

  it("несмежные записи одного дня попадают в одну группу", () => {
    const groups = groupByDay(
      [item(at(2026, 10, 22), 1), item(at(2026, 10, 21), 2), item(at(2026, 10, 22), 3)],
      NOW
    );
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
  });

  it("битая дата не роняет список — отдельная группа «Без даты»", () => {
    const groups = groupByDay([item("не дата", 7), item(at(2026, 10, 22), 1)], NOW);
    expect(groups.map((g) => g.label)).toEqual(["Без даты", "Сегодня"]);
  });

  it("пустой список — пустой результат", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
