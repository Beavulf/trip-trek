import { describe, it, expect } from "vitest";
import { convertCents, exchangeRate, formatRate } from "./fx";

const rates = { USD: 1, BYN: 3.2, EUR: 0.9, JPY: 150, RUB: 90 };

describe("exchangeRate / convertCents", () => {
  it("доллары → местная валюта", () => {
    expect(exchangeRate("USD", "BYN", rates)).toBe(3.2);
    expect(convertCents(50000, "USD", "BYN", rates)).toBe(160000); // 500 $ → 1600 Br
  });

  it("местная → доллары и кросс-курс через USD", () => {
    expect(convertCents(160000, "BYN", "USD", rates)).toBe(50000);
    // 100 € → USD 111,11 → BYN 355,56
    expect(convertCents(10000, "EUR", "BYN", rates)).toBe(35556);
  });

  it("та же валюта — без изменений и без курсов", () => {
    expect(convertCents(1234, "BYN", "BYN", undefined)).toBe(1234);
    expect(exchangeRate("BYN", "BYN", null)).toBe(1);
  });

  it("нет курса — null, а не «курс 1»", () => {
    expect(convertCents(1000, "USD", "BYN", undefined)).toBeNull();
    expect(convertCents(1000, "USD", "XXX", rates)).toBeNull();
    expect(convertCents(1000, "XXX", "BYN", rates)).toBeNull();
    expect(convertCents(1000, "USD", "BYN", { USD: 1, BYN: 0 })).toBeNull();
  });

  it("USD работает и без записи в таблице курсов", () => {
    expect(convertCents(100, "USD", "BYN", { BYN: 3 })).toBe(300);
  });

  it("округляет до копейки и не теряет её на обратном пересчёте крупных сумм", () => {
    expect(convertCents(1, "BYN", "JPY", rates)).toBe(47); // 0,01 Br ≈ 0,47 ¥ (в сотых иены)
    const there = convertCents(123456, "RUB", "BYN", rates)!;
    expect(Math.abs(convertCents(there, "BYN", "RUB", rates)! - 123456)).toBeLessThanOrEqual(30);
  });
});

describe("formatRate", () => {
  it("мелкие курсы — 4 знака, крупные — 2, запятая", () => {
    expect(formatRate(3.225)).toBe("3,2250");
    expect(formatRate(0.0108)).toBe("0,0108");
    expect(formatRate(92)).toBe("92,00");
  });
});
