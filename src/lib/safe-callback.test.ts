import { describe, expect, it } from "vitest";
import { safeCallback } from "./safe-callback";

describe("safeCallback", () => {
  it("пути внутри сайта проходят вместе с query и hash", () => {
    expect(safeCallback("/")).toBe("/");
    expect(safeCallback("/split/abc123")).toBe("/split/abc123");
    expect(safeCallback("/split/add?group=g1&x=1#top")).toBe("/split/add?group=g1&x=1#top");
    expect(safeCallback("/join/ABCD2345")).toBe("/join/ABCD2345");
  });

  it("пусто и не-пути уходят на корень", () => {
    for (const bad of [null, undefined, "", "split/abc", "evil.com", "https://evil.com", "javascript:alert(1)", "data:text/html,x"]) {
      expect(safeCallback(bad)).toBe("/");
    }
  });

  it("протокол-относительные адреса уходят на корень", () => {
    expect(safeCallback("//evil.com")).toBe("/");
    expect(safeCallback("//evil.com/path")).toBe("/");
  });

  it("обходы через обратный слэш, табуляцию и перевод строки не работают", () => {
    expect(safeCallback("/\\evil.com")).toBe("/");
    expect(safeCallback("/\\/evil.com")).toBe("/");
    expect(safeCallback("/\t/evil.com")).toBe("/");
    expect(safeCallback("/\n/evil.com")).toBe("/");
    expect(safeCallback("/\r/evil.com")).toBe("/");
    expect(safeCallback("/ /evil.com")).toBe("/");
    expect(safeCallback("/\u0000/evil.com")).toBe("/");
  });

  it("нормализация точек не собирает «//» из безобидного на вид пути", () => {
    expect(safeCallback("/.//evil.com")).toBe("/");
    expect(safeCallback("/a/..//evil.com")).toBe("/");
  });

  it("результат всегда начинается с одного слэша", () => {
    for (const raw of ["/a", "/a/b?c=d", "/%2F%2Fevil.com", "/.//evil.com", "/a/../../evil.com"]) {
      const out = safeCallback(raw);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
    }
  });
});
