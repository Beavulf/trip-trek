import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOURS, TOUR_GROUP_LABELS, centerTours, getTour, stepsFor, tourForTab, type TourRole } from "./onboarding-content";
import { MOCK_MAX_BLOCKS, validateScene } from "./onboarding-scene";

// Вкладки, видимые в навигации (transport есть в типе, но в навигации его нет)
const NAV_TABS = ["dashboard", "itinerary", "lodging", "map", "budget", "timeline", "gallery", "journal", "achievements", "food", "rest", "weather", "phrases", "ai", "board", "info"];
const ROLES: TourRole[] = ["owner", "member", "viewer"];

describe("TOURS: структура", () => {
  it("id туров и шагов уникальны и безопасны для хранения", () => {
    const tourIds = TOURS.map((t) => t.id);
    expect(new Set(tourIds).size).toBe(tourIds.length);
    const stepIds = TOURS.flatMap((t) => t.steps.map((s) => s.id));
    expect(new Set(stepIds).size).toBe(stepIds.length);
    for (const id of tourIds) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it("у каждой вкладки навигации есть свой тур, и он единственный", () => {
    for (const tab of NAV_TABS) expect(tourForTab(tab as never), tab).toBeTruthy();
    const tabTours = TOURS.filter((t) => t.kind === "tab");
    expect(new Set(tabTours.map((t) => t.tab)).size).toBe(tabTours.length);
    for (const t of tabTours) expect(NAV_TABS).toContain(t.tab);
  });

  it("есть знакомство и оба экрана «Сочтёмся», «Что нового» теперь в колокольчике", () => {
    expect(getTour("welcome")?.kind).toBe("welcome");
    expect(getTour("whatsnew")).toBeUndefined();
    expect(getTour("split-hub")?.splitScreen).toBe("hub");
    expect(getTour("split-group")?.splitScreen).toBe("group");
    expect(centerTours()).toHaveLength(TOURS.length);
  });

  it("тексты непустые и не бесконечные, группы известны", () => {
    for (const t of TOURS) {
      expect(t.title.trim()).not.toBe("");
      expect(t.about.trim()).not.toBe("");
      expect(TOUR_GROUP_LABELS[t.group]).toBeTruthy();
      expect(t.steps.length).toBeGreaterThanOrEqual(2);
      for (const s of t.steps) {
        expect(s.title.trim(), s.id).not.toBe("");
        expect(s.text.trim(), s.id).not.toBe("");
        expect(s.text.length, `${s.id}: текст длиннее 320 знаков не читают`).toBeLessThanOrEqual(320);
        expect(s.title.length, s.id).toBeLessThanOrEqual(40);
        expect(Boolean(s.scene) !== Boolean(s.art), `${s.id}: нужен ровно один из scene/art`).toBe(true);
      }
    }
  });

  it("у каждой роли в каждом туре остаётся не меньше одного шага или тур не нужен — но не «дыры» в середине", () => {
    for (const t of TOURS) {
      for (const role of ROLES) {
        const steps = stepsFor(t, role);
        for (const s of steps) expect(s.roles === undefined || s.roles.includes(role)).toBe(true);
      }
    }
    // знакомство обязано быть у всех ролей, и у каждой — свой первый и последний шаг
    for (const role of ROLES) {
      const steps = stepsFor(getTour("welcome")!, role);
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps[0].art).toBe("welcome");
      expect(steps[steps.length - 1].art).toBe("done");
    }
  });

  it("зрителю не предлагают действий: кнопка «Попробовать» только в шагах для редакторов", () => {
    for (const t of TOURS) {
      for (const s of stepsFor(t, "viewer")) {
        if (s.action) expect(["tab:ai", "profile-ai", "split", "invite"].includes(s.action.do), `${t.id}/${s.id}`).toBe(true);
        expect(s.action?.do.startsWith("quickadd"), `${t.id}/${s.id}`).toBeFalsy();
      }
    }
  });
});

describe("TOURS: макеты", () => {
  it("каждый макет валиден: tap находится, id не дублируются, влезает в рамку", () => {
    for (const t of TOURS) {
      for (const s of t.steps) {
        if (!s.scene) continue;
        expect(validateScene(s.scene), `${t.id}/${s.id}`).toEqual([]);
      }
    }
    expect(MOCK_MAX_BLOCKS).toBeGreaterThan(0);
  });

  it("validateScene ловит висячий tap и перегруз", () => {
    expect(validateScene({ blocks: [{ k: "btn", text: "a", id: "x" }], tap: "y" })).toHaveLength(1);
    const many = Array.from({ length: 6 }, (_, i) => ({ k: "note" as const, text: String(i) }));
    expect(validateScene({ blocks: many }).join()).toContain("не влезет");
    expect(validateScene({ blocks: [{ k: "btn", text: "a" }], then: [{ k: "note", text: "b" }] }).join()).toContain("tap");
    expect(
      validateScene({ blocks: [{ k: "tabs", id: "t", items: ["a", "b"], on: 0 }], tap: "t1" })
    ).toEqual([]);
  });
});

// === Сверка подписей с интерфейсом ===
// Каждая подпись из labels обязана встречаться в исходниках приложения (кроме самого
// обучения). Переименовали кнопку — тест напомнит поправить тур, а не оставит ложную инструкцию.

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "onboarding" || name === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(name) && !/(\.test\.|onboarding-content\.ts$)/.test(name)) out.push(p);
  }
  return out;
}

describe("TOURS: подписи совпадают с интерфейсом", () => {
  const corpus = sourceFiles(join(process.cwd(), "src")).map((f) => readFileSync(f, "utf8")).join("\n");

  it("все labels найдены в исходниках", () => {
    const missing: string[] = [];
    for (const t of TOURS) {
      for (const s of t.steps) {
        for (const label of s.labels ?? []) {
          if (!corpus.includes(label)) missing.push(`${t.id}/${s.id}: «${label}»`);
        }
      }
    }
    expect(missing, `устарели подписи в обучении:\n${missing.join("\n")}`).toEqual([]);
  });

  it("у шагов с кнопками из интерфейса указаны labels (иначе сверка ничего не проверяет)", () => {
    const withButtons = TOURS.flatMap((t) => t.steps).filter((s) => /«[^»]{3,}»/.test(s.text));
    const withLabels = withButtons.filter((s) => (s.labels?.length ?? 0) > 0);
    expect(withLabels.length / withButtons.length).toBeGreaterThan(0.6);
  });
});
