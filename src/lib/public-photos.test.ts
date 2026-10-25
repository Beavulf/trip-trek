import { describe, expect, it } from "vitest";
import { decodePhotoCursor, encodePhotoCursor, photosAfter } from "./public-photos";

describe("курсор фото публичной страницы", () => {
  const pos = { dayNumber: 3, takenAt: new Date("2026-10-10T08:15:30.123Z"), id: "cmabc123" };

  it("кодируется и разбирается без потерь (включая миллисекунды)", () => {
    expect(decodePhotoCursor(encodePhotoCursor(pos))).toEqual(pos);
  });

  it("мусор и старый формат «takenAt~id» → null", () => {
    expect(decodePhotoCursor("")).toBeNull();
    expect(decodePhotoCursor("abc")).toBeNull();
    expect(decodePhotoCursor("2026-10-10T08:15:30.123Z~cmabc123")).toBeNull();
    expect(decodePhotoCursor("x~2026-10-10T08:15:30.123Z~id")).toBeNull();
    expect(decodePhotoCursor("3~не-дата~id")).toBeNull();
    expect(decodePhotoCursor("3~2026-10-10T08:15:30.123Z~")).toBeNull();
  });

  it("условие «после» — три ступени: следующие дни, позже в дне, тот же момент с большим id", () => {
    const { OR } = photosAfter(pos);
    expect(OR).toHaveLength(3);
    expect(OR?.[0]).toEqual({ day: { dayNumber: { gt: 3 } } });
    expect(OR?.[1]).toEqual({ day: { dayNumber: 3 }, takenAt: { gt: pos.takenAt } });
    expect(OR?.[2]).toEqual({ day: { dayNumber: 3 }, takenAt: pos.takenAt, id: { gt: "cmabc123" } });
  });
});
