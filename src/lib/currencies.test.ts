import { describe, expect, it } from "vitest";
import { CURRENCIES, CURRENCY_CODES, FALLBACK_RATES, currencyGroups, currencyLabel, currencyOf, currencySymbol } from "./currencies";

describe("список валют", () => {
  it("коды уникальны и из трёх букв, у каждой есть запасной курс", () => {
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.approxRate).toBeGreaterThan(0);
      expect(FALLBACK_RATES[c.code]).toBe(c.approxRate);
    }
    expect(FALLBACK_RATES.USD).toBe(1);
  });

  it("есть валюты частых направлений", () => {
    for (const code of ["PLN", "CZK", "HUF", "GEL", "AMD", "AZN", "RSD", "EGP", "ILS", "MXN", "BRL", "SEK", "NZD", "ZAR", "UZS", "KGS", "LKR", "MAD", "TND"]) {
      expect(currencyOf(code), code).toBeDefined();
    }
  });

  it("снятых с обращения кодов нет", () => {
    for (const code of ["HRK", "BGN", "SLL", "ZWL", "ANG"]) expect(currencyOf(code), code).toBeUndefined();
  });
});

describe("currencySymbol", () => {
  it("символы знакомых валют и код для остальных", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("PLN")).toBe("zł");
    expect(currencySymbol("RSD")).toBe("RSD ");
    expect(currencySymbol("XXX")).toBe("XXX ");
    expect(currencySymbol(null)).toBe("$");
  });
});

describe("currencyGroups", () => {
  const codes = (list: { code: string }[]) => list.map((c) => c.code);

  it("каждая валюта в списке один раз", () => {
    const { popular, rest } = currencyGroups("USD");
    const all = [...codes(popular), ...codes(rest)];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(CURRENCIES.length);
  });

  it("валюта группы всегда первая", () => {
    expect(currencyGroups("USD", "MDL").popular[0].code).toBe("MDL");
  });

  it("код вне таблицы остаётся доступным: иначе select подменил бы валюту старой траты", () => {
    expect(codes(currencyGroups("BGN").popular)).toContain("BGN");
  });

  it("остальные идут по алфавиту стран", () => {
    const { rest } = currencyGroups("USD");
    const countries = rest.map((c) => c.country);
    expect(countries).toEqual([...countries].sort((a, b) => a.localeCompare(b, "ru")));
  });
});

describe("currencyLabel", () => {
  it("страна, название и код", () => {
    expect(currencyLabel(currencyOf("PLN")!)).toBe("🇵🇱 Польша · злотый (PLN)");
  });
});
