import { describe, it, expect } from "vitest";
import { toBaseCurrency, roundCents } from "./convert";

const rates = { USD: 1, CNY: 7.2, JPY: 150, VND: 25000 };

describe("toBaseCurrency", () => {
  it("USD — без пересчёта, с округлением до центов", () => {
    expect(toBaseCurrency(12.345, "USD", rates)).toBe(12.35);
    expect(toBaseCurrency(10, "USD", undefined)).toBe(10); // курсы не нужны
  });

  it("пересчёт по курсу «за 1 USD»", () => {
    expect(toBaseCurrency(72, "CNY", rates)).toBe(10);
    expect(toBaseCurrency(1000, "JPY", rates)).toBe(6.67);
    expect(toBaseCurrency(250000, "VND", rates)).toBe(10);
  });

  it("нет курса — null, а не «курс 1» (регрессия: 1000 ¥ записывались как $1000)", () => {
    expect(toBaseCurrency(1000, "CNY", undefined)).toBeNull();
    expect(toBaseCurrency(1000, "CNY", {})).toBeNull();
    expect(toBaseCurrency(1000, "EGP", rates)).toBeNull();
  });

  it("битый курс (0, отрицательный, NaN) — null", () => {
    expect(toBaseCurrency(10, "CNY", { CNY: 0 })).toBeNull();
    expect(toBaseCurrency(10, "CNY", { CNY: -7 })).toBeNull();
    expect(toBaseCurrency(10, "CNY", { CNY: NaN })).toBeNull();
  });

  it("не конечная сумма — null", () => {
    expect(toBaseCurrency(NaN, "USD", rates)).toBeNull();
    expect(toBaseCurrency(Infinity, "CNY", rates)).toBeNull();
  });

  it("roundCents", () => {
    expect(roundCents(1.005)).toBe(1); // float: 1.005*100 = 100.49999…
    expect(roundCents(14.285714)).toBe(14.29);
  });
});
