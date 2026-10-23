import { describe, it, expect } from "vitest";
import { isGroupId, readCookieGroup, LAST_GROUP_COOKIE } from "./last-group";

describe("last-group", () => {
  const id = "cmvkx4ll80000g2kncf4h63hq";

  it("isGroupId: cuid проходит, мусор и попытки подмены адреса — нет", () => {
    expect(isGroupId(id)).toBe(true);
    for (const bad of ["", "abc", "../admin", "x".repeat(41), "CMVKX4LL80000G2KNCF4H63HQ", `${id}/../x`, `${id}?a=1`, null, undefined, 5]) {
      expect(isGroupId(bad)).toBe(false);
    }
  });

  it("readCookieGroup: достаёт значение из строки cookie среди других", () => {
    expect(readCookieGroup(`a=1; ${LAST_GROUP_COOKIE}=${id}; theme=dark`)).toBe(id);
    expect(readCookieGroup(`${LAST_GROUP_COOKIE}=${id}`)).toBe(id);
  });

  it("readCookieGroup: нет cookie или значение не id — null", () => {
    expect(readCookieGroup("")).toBeNull();
    expect(readCookieGroup("a=1; b=2")).toBeNull();
    expect(readCookieGroup(`${LAST_GROUP_COOKIE}=../evil`)).toBeNull();
    expect(readCookieGroup(`x${LAST_GROUP_COOKIE}=${id}`)).toBeNull(); // другое имя с тем же хвостом
  });
});
