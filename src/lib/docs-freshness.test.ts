import { describe, expect, it } from "vitest";
import { DOCS_MAX_AGE_DAYS, freshnessVerdict, parseLastVerified, verificationAgeDays } from "./docs-freshness";

describe("parseLastVerified", () => {
  it("находит дату в шапке", () => {
    expect(parseLastVerified("# T\n\nLast verified: 2026-11-18 (сверка)\n")).toBe("2026-11-18");
  });

  it("null без поля и при неполной дате", () => {
    expect(parseLastVerified("# просто текст\n")).toBeNull();
    expect(parseLastVerified("Last verified: 2026-11")).toBeNull();
  });
});

describe("verificationAgeDays", () => {
  it("считает календарные дни через границу месяца", () => {
    expect(verificationAgeDays("2026-01-30", "2026-02-02")).toBe(3);
  });

  it("нулевой день сегодня, отрицательный — дата из будущего", () => {
    expect(verificationAgeDays("2026-11-18", "2026-11-18")).toBe(0);
    expect(verificationAgeDays("2026-11-19", "2026-11-18")).toBe(-1);
  });

  it("null на битой дате", () => {
    expect(verificationAgeDays("2026-13-40", "2026-11-18")).toBeNull();
  });
});

describe("freshnessVerdict", () => {
  const doc = "# T\nLast verified: 2026-11-04\n";

  it("свежая дата — ok", () => {
    const v = freshnessVerdict(doc, "2026-11-18");
    expect(v.ok).toBe(true);
    expect(v.ageDays).toBe(14); // ровно на границе — ещё ок
  });

  it("старше лимита — падение с внятной причиной", () => {
    const v = freshnessVerdict(doc, "2026-11-19");
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("14");
  });

  it("нет поля — падение", () => {
    const v = freshnessVerdict("# без шапки\n", "2026-11-18");
    expect(v.ok).toBe(false);
    expect(v.verified).toBeNull();
  });

  it("дата из будущего — падение", () => {
    const v = freshnessVerdict("# T\nLast verified: 2027-01-01\n", "2026-11-18");
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("будущем");
  });

  it("лимит настраивается", () => {
    expect(freshnessVerdict(doc, "2026-11-19", 30).ok).toBe(true);
    expect(DOCS_MAX_AGE_DAYS).toBe(14);
  });
});
