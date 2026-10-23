import { describe, it, expect } from "vitest";
import { categoryOf, suggestCategory, SPLIT_CATEGORIES } from "./categories";

describe("categoryOf", () => {
  it("неизвестное → other", () => {
    expect(categoryOf("groceries")).toBe("groceries");
    expect(categoryOf("casino")).toBe("other");
    expect(categoryOf(null)).toBe("other");
  });
});

describe("suggestCategory", () => {
  it.each([
    ["Такси домой", "transport"],
    ["пятёрочка", "groceries"],
    ["Аренда за октябрь", "rent"],
    ["интернет", "internet"],
    ["Коммуналка", "utilities"],
    ["пицца", "cafe"],
    ["Netflix", "subscriptions"],
    ["аптека", "health"],
    ["подарок маме", "gifts"],
    ["хозтовары", "home"],
    ["кино", "fun"],
  ])("«%s» → %s", (text, expected) => {
    expect(suggestCategory(text)).toBe(expected);
  });

  it("кириллические границы слов: виноград — не вино, клубника — не клуб", () => {
    expect(suggestCategory("виноград")).not.toBe("cafe");
    expect(suggestCategory("клубника")).not.toBe("fun");
  });

  it("узкая категория выигрывает у широкой: «такси из кафе» — транспорт", () => {
    expect(suggestCategory("такси из кафе")).toBe("transport");
  });

  it("слишком короткое или непонятное — null", () => {
    expect(suggestCategory("ab")).toBeNull();
    expect(suggestCategory("фыва")).toBeNull();
  });

  it("все подсказываемые категории есть в справочнике", () => {
    for (const t of ["такси", "аренда", "кино", "аптека"]) {
      expect(suggestCategory(t) && SPLIT_CATEGORIES[suggestCategory(t)!]).toBeTruthy();
    }
  });
});
