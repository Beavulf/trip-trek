import { describe, expect, it } from "vitest";
import { EMPTY_ONBOARDING_STATE, type OnboardingState } from "./onboarding-state";
import { actionAllowed, formatUpdateDate, isUpdateUnread, unreadUpdates, updatesFor } from "./updates";
import type { UpdateEntry } from "./updates-content";

const entry = (id: string, date: string, area: UpdateEntry["area"] = "all"): UpdateEntry => ({
  id,
  date,
  area,
  kind: "new",
  icon: "✨",
  title: id,
  summary: "",
  lead: "",
  demo: [],
  points: [],
});
const read = (...ids: string[]): OnboardingState => ({ ...EMPTY_ONBOARDING_STATE, updatesRead: ids });

describe("updatesFor", () => {
  const all = [entry("a", "2026-10-01", "trip"), entry("b", "2026-10-03", "split"), entry("c", "2026-10-02", "all")];

  it("фильтрует по области: общие видны везде, остальные — только у себя", () => {
    expect(updatesFor("trip", all).map((u) => u.id)).toEqual(["c", "a"]);
    expect(updatesFor("split", all).map((u) => u.id)).toEqual(["b", "c"]);
  });

  it("свежие сверху независимо от порядка в массиве", () => {
    expect(updatesFor("trip", [entry("x", "2026-01-01"), entry("y", "2026-12-01")]).map((u) => u.id)).toEqual(["y", "x"]);
  });
});

describe("isUpdateUnread", () => {
  const e = entry("e", "2026-10-20");

  it("прочитанная по id — не непрочитана", () => {
    expect(isUpdateUnread(e, EMPTY_ONBOARDING_STATE, "2026-01-01T00:00:00Z")).toBe(true);
    expect(isUpdateUnread(e, read("e"), "2026-01-01T00:00:00Z")).toBe(false);
  });

  it("старожилу (зарегистрирован до выхода) приходит непрочитанной", () => {
    expect(isUpdateUnread(e, EMPTY_ONBOARDING_STATE, "2026-10-19T23:59:00Z")).toBe(true);
  });

  it("новичку история не нужна: вышло в день регистрации или раньше — уже прочитано", () => {
    expect(isUpdateUnread(e, EMPTY_ONBOARDING_STATE, "2026-10-20T08:00:00Z")).toBe(false);
    expect(isUpdateUnread(e, EMPTY_ONBOARDING_STATE, "2026-11-01T08:00:00Z")).toBe(false);
  });

  it("дата регистрации неизвестна или битая — считаем по прочитанным", () => {
    expect(isUpdateUnread(e, EMPTY_ONBOARDING_STATE, null)).toBe(true);
    expect(isUpdateUnread(e, EMPTY_ONBOARDING_STATE, "не дата")).toBe(true);
  });

  it("unreadUpdates отдаёт только непрочитанные", () => {
    const list = [e, entry("f", "2026-10-25")];
    expect(unreadUpdates(list, read("e"), "2026-01-01T00:00:00Z").map((u) => u.id)).toEqual(["f"]);
  });
});

describe("actionAllowed", () => {
  it("зритель не добавляет и не приглашает", () => {
    expect(actionAllowed("quickadd:photo", "viewer", "trip")).toBe(false);
    expect(actionAllowed("invite", "viewer", "trip")).toBe(false);
    expect(actionAllowed("split", "viewer", "trip")).toBe(true);
    expect(actionAllowed("quickadd:photo", "member", "trip")).toBe(true);
  });

  it("в «Сочтёмся» работают только переходы, которые там имеют смысл", () => {
    expect(actionAllowed("split", null, "split")).toBe(true);
    expect(actionAllowed("profile-ai", null, "split")).toBe(true);
    expect(actionAllowed("tab:map", null, "split")).toBe(false);
    expect(actionAllowed("center", null, "split")).toBe(false);
    expect(actionAllowed("center", "owner", "trip")).toBe(true);
  });
});

describe("formatUpdateDate", () => {
  it("день и месяц; год — только если не текущий", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    expect(formatUpdateDate("2026-10-25", now)).toMatch(/^25 окт/);
    expect(formatUpdateDate("2026-10-25", now)).not.toMatch(/2026/);
    expect(formatUpdateDate("2025-12-31", now)).toMatch(/2025/);
  });
});
