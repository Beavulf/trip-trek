import { describe, expect, it } from "vitest";
import { isMaintenanceExempt, maintenanceHtml, normalizeNotice, NOTICE_MAX_LENGTH } from "./maintenance";

describe("normalizeNotice", () => {
  it("схлопывает пробелы и обрезает края", () => {
    expect(normalizeNotice("  в 23:00 \n  обновление  ")).toBe("в 23:00 обновление");
  });
  it("пусто и не строка → null", () => {
    expect(normalizeNotice("   ")).toBeNull();
    expect(normalizeNotice(null)).toBeNull();
    expect(normalizeNotice(42)).toBeNull();
  });
  it("режет по лимиту", () => {
    expect(normalizeNotice("я".repeat(NOTICE_MAX_LENGTH + 50))).toHaveLength(NOTICE_MAX_LENGTH);
  });
});

describe("isMaintenanceExempt", () => {
  it.each([
    "/api/health",
    "/api/app-status",
    "/api/auth/custom-login",
    "/api/auth/custom-signout",
    "/_next/static/chunks/app.js",
    "/login",
    "/landing",
    "/privacy",
    "/sw.js",
    "/manifest.webmanifest",
    "/icon-192.png",
  ])("%s доступен всегда", (path) => {
    expect(isMaintenanceExempt(path)).toBe(true);
  });

  it.each([
    "/",
    "/split",
    "/split/abc",
    "/profile",
    "/admin",
    "/p/token",
    "/join/CODE",
    "/api/trips",
    "/api/auth/register",
    "/api/auth/custom-session",
    "/api/photos/export.zip",
    "/loginx",
  ])("%s закрыт", (path) => {
    expect(isMaintenanceExempt(path)).toBe(false);
  });
});

describe("maintenanceHtml", () => {
  it("экранирует текст из админки", () => {
    const html = maintenanceHtml('<script>alert("x")</script> & co');
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; co");
  });
});
