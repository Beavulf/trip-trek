import { describe, expect, it } from "vitest";
import { isSlowConnection } from "./net";

describe("isSlowConnection", () => {
  it("экономия трафика и медленные типы связи — слабая связь", () => {
    expect(isSlowConnection({ saveData: true, effectiveType: "4g" })).toBe(true);
    for (const t of ["slow-2g", "2g", "3g"]) expect(isSlowConnection({ effectiveType: t })).toBe(true);
  });

  it("4g и неизвестные значения — нормальная связь", () => {
    expect(isSlowConnection({ effectiveType: "4g" })).toBe(false);
    expect(isSlowConnection({})).toBe(false);
  });

  it("нет Network Information API (iOS Safari, SSR) — ведём себя как раньше", () => {
    expect(isSlowConnection(null)).toBe(false);
    expect(isSlowConnection()).toBe(false); // node-env: navigator.connection нет
  });
});
