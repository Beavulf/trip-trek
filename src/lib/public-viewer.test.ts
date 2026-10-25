import { describe, expect, it } from "vitest";
import { RESUME_TTL_MS, buildDayIndex, dayJumpTarget, parseResume } from "./public-viewer";

// дни 1: 3 фото, 2: 2 фото, 4: 1 фото (день 3 без фото)
const list = [1, 1, 1, 2, 2, 4].map((dayNumber) => ({ dayNumber }));

describe("buildDayIndex", () => {
  it("находит начало и размер каждого дня", () => {
    const { startOf, countOf } = buildDayIndex(list);
    expect([...startOf]).toEqual([[1, 0], [2, 3], [4, 5]]);
    expect([...countOf]).toEqual([[1, 3], [2, 2], [4, 1]]);
  });

  it("фото без дня не попадают в индекс", () => {
    expect(buildDayIndex([{ dayNumber: null }]).startOf.size).toBe(0);
  });
});

describe("dayJumpTarget", () => {
  it("вперёд — в начало следующего дня с фото, пропуская пустые дни", () => {
    expect(dayJumpTarget(list, 0, "next")).toBe(3);
    expect(dayJumpTarget(list, 4, "next")).toBe(5);
  });

  it("на последнем дне вперёд некуда", () => {
    expect(dayJumpTarget(list, 5, "next")).toBeNull();
  });

  it("назад из глубины дня — в начало этого дня, из начала — в начало предыдущего", () => {
    expect(dayJumpTarget(list, 2, "prev")).toBe(0);
    expect(dayJumpTarget(list, 4, "prev")).toBe(3);
    expect(dayJumpTarget(list, 3, "prev")).toBe(0);
    expect(dayJumpTarget(list, 5, "prev")).toBe(3);
  });

  it("в самом начале назад некуда; фото без дня или вне списка — null", () => {
    expect(dayJumpTarget(list, 0, "prev")).toBeNull();
    expect(dayJumpTarget([{ dayNumber: null }], 0, "next")).toBeNull();
    expect(dayJumpTarget(list, 99, "next")).toBeNull();
  });
});

describe("parseResume", () => {
  const now = 1_000_000_000_000;
  it("разбирает фото и день", () => {
    expect(parseResume(JSON.stringify({ kind: "photo", photoId: "abc", at: now }), now)).toEqual({
      kind: "photo",
      photoId: "abc",
      at: now,
    });
    expect(parseResume(JSON.stringify({ kind: "day", dayNumber: 3, at: now }), now)).toEqual({
      kind: "day",
      dayNumber: 3,
      at: now,
    });
  });

  it("мусор, неверные поля и старьё → null", () => {
    expect(parseResume(null, now)).toBeNull();
    expect(parseResume("не json", now)).toBeNull();
    expect(parseResume("null", now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: "photo", photoId: "", at: now }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: "day", dayNumber: 0, at: now }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: "day", dayNumber: 1.5, at: now }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: "other", at: now }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ kind: "day", dayNumber: 2, at: now - RESUME_TTL_MS - 1 }), now)).toBeNull();
  });
});
