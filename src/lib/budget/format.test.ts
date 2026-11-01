import { describe, it, expect } from "vitest";
import { moneyDelta, moneyExact, moneyWhole } from "./format";

// Intl разделяет разряды неразрывным пробелом: для читаемости тестов приводим к обычному
const plain = (s: string) => s.replace(/ /g, " ");

describe("moneyWhole", () => {
  it("разряды через пробел, без копеек", () => {
    expect(plain(moneyWhole("$", 6743.09))).toBe("$6 743");
    expect(plain(moneyWhole("¥", 1250))).toBe("¥1 250");
  });

  it("минус — настоящий и стоит перед символом валюты", () => {
    expect(moneyWhole("$", -254.15)).toBe("−$254");
  });

  it("почти ноль не превращается в минус ноль", () => {
    expect(moneyWhole("$", -0.2)).toBe("$0");
  });
});

describe("moneyExact", () => {
  it("всегда две цифры после запятой", () => {
    expect(plain(moneyExact("$", 1984.08))).toBe("$1 984,08");
    expect(moneyExact("$", 12)).toBe("$12,00");
    expect(moneyExact("$", 0.74)).toBe("$0,74");
  });

  it("плавающая точка не даёт хвостов и минус ноля", () => {
    expect(moneyExact("$", 0.1 + 0.2)).toBe("$0,30");
    expect(moneyExact("$", -0.001)).toBe("$0,00");
  });
});

describe("moneyDelta", () => {
  it("знак виден у обеих сторон, у нуля знака нет", () => {
    expect(moneyDelta("$", 0.74)).toBe("+$0,74");
    expect(moneyDelta("$", -0.74)).toBe("−$0,74");
    expect(moneyDelta("$", 0)).toBe("$0,00");
  });
});
