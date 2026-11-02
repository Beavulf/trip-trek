import { describe, expect, it } from "vitest";
import { checklistProgress, defaultInfoView, findCallTargets, findUrl, groupChecklist, groupReference, hasChecklistText } from "./info-page";
import type { ChecklistItem } from "@/hooks/trip/use-checklist";
import type { InfoItem } from "@/hooks/trip/use-info";

const check = (id: string, category: string, done = false, order = 0): ChecklistItem => ({ id, text: id, category, done, order });
const info = (type: string, title: string, content: string, order = 0): InfoItem => ({ id: title, type, title, content, icon: null, order });
const numbers = (i: InfoItem) => findCallTargets(i).map((t) => t.number);

describe("defaultInfoView", () => {
  it("до поездки — чек-лист", () => expect(defaultInfoView("2026-11-10", "2026-11-02")).toBe("checklist"));
  it("в первый день и после — справка", () => {
    expect(defaultInfoView("2026-11-02", "2026-11-02")).toBe("reference");
    expect(defaultInfoView("2026-10-01", "2026-11-02")).toBe("reference");
  });
  it("поездка не загрузилась, например без сети — справка", () => expect(defaultInfoView(null, "2026-11-02")).toBe("reference"));
});

describe("groupChecklist", () => {
  it("постоянный порядок, пустых групп нет, готовое отдельно", () => {
    const groups = groupChecklist([check("a", "health"), check("b", "documents", true), check("c", "documents")]);
    expect(groups.map((g) => g.cat)).toEqual(["documents", "health"]);
    expect(groups[0]).toMatchObject({ total: 2 });
    expect(groups[0].pending.map((i) => i.id)).toEqual(["c"]);
    expect(groups[0].done.map((i) => i.id)).toEqual(["b"]);
  });
  it("чужая категория не теряется", () => {
    expect(groupChecklist([check("a", "из-импорта")])[0].cat).toBe("other");
  });
  it("внутри группы порядок по order", () => {
    expect(groupChecklist([check("b", "other", false, 2), check("a", "other", false, 1)])[0].pending.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("checklistProgress", () => {
  it("считает остаток и процент", () => {
    expect(checklistProgress([check("a", "x", true), check("b", "x"), check("c", "x"), check("d", "x", true)])).toEqual({ total: 4, done: 2, pending: 2, pct: 50 });
    expect(checklistProgress([])).toEqual({ total: 0, done: 0, pending: 0, pct: 0 });
  });
});

describe("hasChecklistText", () => {
  it("не различает регистр и пробелы", () => expect(hasChecklistText([{ ...check("a", "x"), text: " паспорт  " }], "Паспорт")).toBe(true));
});

describe("groupReference", () => {
  it("запись неизвестного типа видна в «Другое»", () => {
    expect(groupReference([info("visa", "Виза", "текст")]).map((g) => g.label)).toEqual(["Другое"]);
  });
  it("контакты идут первыми", () => {
    expect(groupReference([info("tip", "Совет", "т"), info("contact", "Отель", "т")]).map((g) => g.type)).toEqual(["contact", "tip"]);
  });
});

describe("findCallTargets", () => {
  it("настоящая запись: каждая служба своей кнопкой", () => {
    expect(findCallTargets(info("contact", "Единый номер экстренных служб", "110 — полиция, 120 — скорая, 119 — пожарная"))).toEqual([
      { number: "110", label: "полиция" },
      { number: "120", label: "скорая" },
      { number: "119", label: "пожарная" },
    ]);
  });
  it("служба указана перед номером", () => {
    expect(findCallTargets(info("contact", "Китай", "Полиция: 110"))).toEqual([{ number: "110", label: "Полиция" }]);
  });
  it("обычный телефон с подписью и плюсом", () => {
    expect(findCallTargets(info("contact", "Отель", "Ресепшн: +86 20 1234-5678"))).toEqual([{ number: "+862012345678", label: "Ресепшн" }]);
  });
  it("несколько телефонов через перевод строки, без дублей", () => {
    expect(numbers(info("contact", "Гид", "+375 29 111-22-33\n+375 29 444-55-66\n+375 29 111-22-33"))).toEqual(["+375291112233", "+375294445566"]);
  });
  it("дом в адресе не становится звонком", () => {
    expect(numbers(info("contact", "Консульство", "Пекин, ул. Дунчжимэнь 123"))).toEqual([]);
  });
  it("цена, время и дата не телефон", () => {
    expect(numbers(info("transport", "Метро", "$0.5-3 за поездку, 15 000 в день"))).toEqual([]);
    expect(numbers(info("transport", "Поезд", "Шэньчжэнь: 30-40 минут, 09:00-18:00"))).toEqual([]);
    expect(numbers(info("tip", "Срок", "до 2026-10-08"))).toEqual([]);
  });
  it("вне контактов короткие номера не ищем, но полный телефон находим", () => {
    expect(numbers(info("tip", "Служба такси", "Вызов 120 юаней"))).toEqual([]);
    expect(numbers(info("transport", "Такси", "Диспетчер +7 495 123-45-67"))).toEqual(["+74951234567"]);
  });
});

describe("findUrl", () => {
  it("находит ссылку в тексте", () => {
    expect(findUrl("Сайт: https://metro.example/map?x=1 и всё")).toBe("https://metro.example/map?x=1");
    expect(findUrl("без ссылки")).toBeNull();
  });
});
