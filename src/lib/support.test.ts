import { describe, expect, it } from "vitest";
import { hasSupportOptions, normalizeDonationUrl, normalizeWmzPurse } from "./support";

describe("normalizeDonationUrl", () => {
  it("https-ссылка проходит", () => {
    expect(normalizeDonationUrl("https://www.donationalerts.com/r/beavulf")).toBe("https://www.donationalerts.com/r/beavulf");
    expect(normalizeDonationUrl("  https://boosty.to/name  ")).toBe("https://boosty.to/name");
  });

  it("не-https, схемы-ловушки, пусто и мусор отклоняются", () => {
    for (const bad of [null, undefined, "", "  ", "http://x.com/a", "javascript:alert(1)", "data:text/html,x", "donationalerts.com/r/x", "https://", "https://localhost/x", "https://" + "a".repeat(200) + ".com"]) {
      expect(normalizeDonationUrl(bad)).toBeNull();
    }
  });
});

describe("normalizeWmzPurse", () => {
  it("Z и 12 цифр, регистр и пробелы не важны", () => {
    expect(normalizeWmzPurse("Z123456789012")).toBe("Z123456789012");
    expect(normalizeWmzPurse(" z123456789012 ")).toBe("Z123456789012");
  });

  it("другие кошельки и мусор отклоняются", () => {
    for (const bad of [null, undefined, "", "R123456789012", "Z12345678901", "Z1234567890123", "Z12345678901A", "Z 123456789012", "<script>"]) {
      expect(normalizeWmzPurse(bad)).toBeNull();
    }
  });
});

describe("hasSupportOptions", () => {
  it("нужен хотя бы один способ", () => {
    expect(hasSupportOptions(null)).toBe(false);
    expect(hasSupportOptions({ donationAlertsUrl: null, webmoneyPurse: null })).toBe(false);
    expect(hasSupportOptions({ donationAlertsUrl: "https://a.b/c", webmoneyPurse: null })).toBe(true);
    expect(hasSupportOptions({ donationAlertsUrl: null, webmoneyPurse: "Z123456789012" })).toBe(true);
  });
});
