import { describe, expect, it } from "vitest";
import { buildChecklist, checklistProgress, checklistVisible, type ChecklistInput } from "./onboarding-checklist";

const base: ChecklistInput = {
  role: "owner",
  totalPlaces: 0,
  participants: 1,
  totalSpent: 0,
  totalPhotos: 0,
  canInvite: true,
  hasAiKey: false,
};

describe("buildChecklist", () => {
  it("новая поездка: только «создать» сделано", () => {
    const items = buildChecklist(base);
    expect(items.filter((i) => i.done).map((i) => i.id)).toEqual(["trip"]);
    expect(checklistProgress(items)).toEqual({ done: 1, total: 5, complete: false });
  });

  it("пункты отмечаются по данным поездки", () => {
    const items = buildChecklist({ ...base, totalPlaces: 2, participants: 3, totalSpent: 40, totalPhotos: 1 });
    expect(checklistProgress(items)).toEqual({ done: 5, total: 5, complete: true });
  });

  it("ключ ИИ необязателен: не входит в прогресс", () => {
    const items = buildChecklist({ ...base, totalPlaces: 1, participants: 2, totalSpent: 1, totalPhotos: 1, hasAiKey: false });
    expect(checklistProgress(items).complete).toBe(true);
    expect(items.find((i) => i.id === "ai")?.optional).toBe(true);
  });

  it("пока профиль не загружен, пункта про ИИ нет", () => {
    expect(buildChecklist({ ...base, hasAiKey: null }).some((i) => i.id === "ai")).toBe(false);
  });

  it("участнику без права приглашать пункт «позвать друга» не показываем", () => {
    const items = buildChecklist({ ...base, canInvite: false });
    expect(items.some((i) => i.id === "friend")).toBe(false);
    expect(checklistProgress(items).total).toBe(4);
  });

  it("у невыполненных пунктов есть действие, у «создать» его нет", () => {
    const items = buildChecklist(base);
    for (const i of items.filter((x) => !x.done)) expect(i.action).toBeTruthy();
    expect(items[0].action).toBeUndefined();
  });
});

describe("checklistVisible", () => {
  it("скрыт зрителю, скрытый руками и пока роль неизвестна", () => {
    expect(checklistVisible("owner", false)).toBe(true);
    expect(checklistVisible("member", false)).toBe(true);
    expect(checklistVisible("viewer", false)).toBe(false);
    expect(checklistVisible(null, false)).toBe(false);
    expect(checklistVisible("owner", true)).toBe(false);
  });
});
