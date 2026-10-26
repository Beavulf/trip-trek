import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTour } from "./onboarding-content";
import { validateScene } from "./onboarding-scene";
import { actionAllowed } from "./updates";
import { UPDATES, UPDATE_KIND_LABEL } from "./updates-content";

describe("UPDATES: структура", () => {
  it("id уникальны и безопасны для хранения, даты настоящие", () => {
    const ids = UPDATES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of UPDATES) {
      expect(u.id, u.id).toMatch(/^[a-z0-9-]{1,60}$/);
      expect(u.date, u.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(u.date)), u.id).toBe(false);
      expect(UPDATE_KIND_LABEL[u.kind], u.id).toBeTruthy();
      expect(["all", "trip", "split"]).toContain(u.area);
    }
  });

  it("новые записи — сверху (по дате, не по возрастанию)", () => {
    const dates = UPDATES.map((u) => u.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("тексты непустые и читаемой длины", () => {
    for (const u of UPDATES) {
      expect(u.title.trim(), u.id).not.toBe("");
      expect(u.title.length, `${u.id}: заголовок`).toBeLessThanOrEqual(48);
      expect(u.summary.length, `${u.id}: строка списка`).toBeLessThanOrEqual(80);
      expect(u.lead.length, `${u.id}: вступление`).toBeLessThanOrEqual(300);
      expect(u.points.length, `${u.id}: пунктов`).toBeGreaterThanOrEqual(2);
      expect(u.points.length, `${u.id}: пунктов`).toBeLessThanOrEqual(5);
      for (const p of u.points) {
        expect(p.icon.trim(), `${u.id}/${p.title}`).not.toBe("");
        expect(p.title.length, `${u.id}/${p.title}`).toBeLessThanOrEqual(40);
        expect(p.text.length, `${u.id}/${p.title}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it("у каждой записи есть демо из 1–4 экранов с корректными макетами", () => {
    for (const u of UPDATES) {
      expect(u.demo.length, u.id).toBeGreaterThanOrEqual(1);
      expect(u.demo.length, u.id).toBeLessThanOrEqual(4);
      u.demo.forEach((d, i) => {
        expect(d.caption.length, `${u.id}#${i + 1}: подпись`).toBeLessThanOrEqual(70);
        expect(validateScene(d.scene), `${u.id}#${i + 1}`).toEqual([]);
      });
    }
  });

  it("связанные туры существуют, а кнопка «Попробовать» доступна там, где запись видна", () => {
    for (const u of UPDATES) {
      if (u.tour) expect(getTour(u.tour.id), `${u.id}: тур ${u.tour.id}`).toBeTruthy();
      if (!u.action) continue;
      if (u.area !== "split") expect(actionAllowed(u.action.do, "owner", "trip"), `${u.id} в поездке`).toBe(true);
      // запись для «Сочтёмся» (в т.ч. общая) не должна вести туда, где её действие не работает
      if (u.area !== "trip") expect(actionAllowed(u.action.do, "owner", "split"), `${u.id} в «Сочтёмся»`).toBe(true);
    }
  });
});

// Подписи интерфейса из записей обязаны встречаться в исходниках (как у обучения): переименовали кнопку —
// тест напомнит поправить запись, а не оставит ложную инструкцию.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "onboarding" || name === "updates" || name === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(name) && !/(\.test\.|onboarding-content\.ts$|updates-content\.ts$)/.test(name)) out.push(p);
  }
  return out;
}

describe("UPDATES: подписи совпадают с интерфейсом", () => {
  const corpus = sourceFiles(join(process.cwd(), "src")).map((f) => readFileSync(f, "utf8")).join("\n");

  it("все labels найдены в исходниках", () => {
    const missing: string[] = [];
    for (const u of UPDATES) for (const label of u.labels ?? []) if (!corpus.includes(label)) missing.push(`${u.id}: «${label}»`);
    expect(missing, `устарели подписи в обновлениях:\n${missing.join("\n")}`).toEqual([]);
  });

  it("записи с кнопками в тексте имеют labels", () => {
    const withQuotes = UPDATES.filter((u) => /«[^»]{3,}»/.test(u.lead + u.points.map((p) => p.text).join(" ")));
    for (const u of withQuotes) expect((u.labels ?? []).length, `${u.id}: в тексте есть «подписи» — перечислите их в labels`).toBeGreaterThan(0);
  });
});
