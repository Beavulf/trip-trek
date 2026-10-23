import { describe, it, expect } from "vitest";
import { centsToInput, formatCents, MAX_AMOUNT_CENTS, parseAmountToCents, toCents } from "./money";

describe("parseAmountToCents", () => {
  it("принимает запятую, точку, пробелы, число", () => {
    expect(parseAmountToCents("12,5")).toBe(1250);
    expect(parseAmountToCents("12.50")).toBe(1250);
    expect(parseAmountToCents(" 1 200 ")).toBe(120000);
    expect(parseAmountToCents(".5")).toBe(50);
    expect(parseAmountToCents(7)).toBe(700);
    expect(parseAmountToCents("0")).toBe(0);
  });

  it("не округляет молча лишние знаки и отвергает мусор", () => {
    expect(parseAmountToCents("12.555")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("-5")).toBeNull();
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("1e3")).toBeNull();
    expect(parseAmountToCents(NaN)).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
  });

  it("потолок суммы", () => {
    expect(parseAmountToCents(String(MAX_AMOUNT_CENTS / 100))).toBe(MAX_AMOUNT_CENTS);
    expect(parseAmountToCents(String(MAX_AMOUNT_CENTS / 100 + 1))).toBeNull();
  });

  it("toCents не теряет копейку на классическом 1.005/0.1+0.2", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
  });
});

describe("formatCents", () => {
  it("копейки показываются только когда они есть", () => {
    expect(formatCents(4500, "BYN")).toBe("45 Br");
    expect(formatCents(1250, "BYN")).toBe("12,50 Br");
    expect(formatCents(120000, "RUB")).toMatch(/^1\s200\s₽$/);
  });

  it("знак: минус настоящий, плюс по запросу", () => {
    expect(formatCents(-1250, "USD")).toBe("−12,50 $");
    expect(formatCents(1250, "USD", { sign: true })).toBe("+12,50 $");
    expect(formatCents(0, "USD", { sign: true })).toBe("0 $");
  });

  it("centsToInput — обратное к parse", () => {
    expect(centsToInput(1250)).toBe("12,50");
    expect(centsToInput(1200)).toBe("12");
    expect(centsToInput(5)).toBe("0,05");
    for (const c of [1, 5, 99, 100, 1250, 1999, 100000, 99999999]) expect(parseAmountToCents(centsToInput(c))).toBe(c);
  });
});
