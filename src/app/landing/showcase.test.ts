import { describe, it, expect } from "vitest";
import { contactLink, demoHref, isInAppBrowser, registerHrefFor, sanitizeInviteParam } from "./showcase";

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

describe("sanitizeInviteParam / registerHrefFor", () => {
  it("код из ссылки: только буквы и цифры нужной длины", () => {
    expect(sanitizeInviteParam("7HAGNHGE")).toBe("7HAGNHGE");
    expect(sanitizeInviteParam(" abcd2345 ")).toBe("abcd2345");
    expect(sanitizeInviteParam(["ABCD2345", "x"])).toBe("ABCD2345");
  });

  it("мусор, схемы и слишком длинное — не код", () => {
    for (const bad of [null, undefined, "", "abc", "AB CD2345", "//evil.com", "javascript:alert(1)", "A".repeat(33), "ab-cd-23", "<script>"]) {
      expect(sanitizeInviteParam(bad)).toBeNull();
    }
  });

  it("адрес регистрации с кодом и без", () => {
    expect(registerHrefFor(null)).toBe("/login?mode=register");
    expect(registerHrefFor("ABCD2345")).toBe("/login?mode=register&code=ABCD2345");
  });
});

describe("isInAppBrowser", () => {
  it("узнаёт TikTok, Instagram и Facebook", () => {
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile/15E148 Instagram 300.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]")).toBe(true);
  });

  it("обычные браузеры и пустой UA — нет", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36")).toBe(false);
    expect(isInAppBrowser(null)).toBe(false);
  });
});
