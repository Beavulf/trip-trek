import { describe, it, expect } from "vitest";
import { contactLink, demoHref } from "./showcase";

describe("contactLink", () => {
  it("«@имя» → ссылка на t.me", () => {
    expect(contactLink("@triptrek_help")).toEqual({ href: "https://t.me/triptrek_help", label: "@triptrek_help" });
    expect(contactLink("  @triptrek_help  ")?.href).toBe("https://t.me/triptrek_help");
  });

  it("https-адрес остаётся ссылкой, подпись — хост и путь без хвостового слэша", () => {
    expect(contactLink("https://t.me/triptrek_help/")).toEqual({
      href: "https://t.me/triptrek_help/",
      label: "t.me/triptrek_help",
    });
  });

  it("пусто, мусор и опасные схемы ссылкой не становятся", () => {
    for (const bad of [null, undefined, "", "   ", "triptrek", "@a", "@имя", "javascript:alert(1)", "http://t.me/x", "data:text/html,x", "https://"]) {
      expect(contactLink(bad)).toBeNull();
    }
  });
});

describe("demoHref", () => {
  it("токен → /p/<token>, пробелы срезаются", () => {
    expect(demoHref(" abc123 ")).toBe("/p/abc123");
  });

  it("токен экранируется, чтобы не вылезти из пути", () => {
    expect(demoHref("a/b?c")).toBe("/p/a%2Fb%3Fc");
  });

  it("пустой токен — примера нет", () => {
    expect(demoHref(null)).toBeNull();
    expect(demoHref("  ")).toBeNull();
  });
});
