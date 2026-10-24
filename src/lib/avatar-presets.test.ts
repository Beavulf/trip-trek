import { describe, expect, it } from "vitest";
import { AVATAR_COLORS, AVATAR_EMOJIS, isAvatarColor, isAvatarEmoji, pickRandom } from "./avatar-presets";

describe("avatar-presets", () => {
  it("принимает только значения из списков", () => {
    expect(isAvatarEmoji("🦊")).toBe(true);
    expect(isAvatarEmoji("😀")).toBe(false);
    expect(isAvatarEmoji("<script>")).toBe(false);
    expect(isAvatarEmoji(undefined)).toBe(false);
    expect(isAvatarColor("#f97316")).toBe(true);
    expect(isAvatarColor("red; background:url(x)")).toBe(false);
    expect(isAvatarColor(123)).toBe(false);
  });

  it("pickRandom не выходит за границы списка", () => {
    expect(pickRandom(AVATAR_EMOJIS, () => 0)).toBe(AVATAR_EMOJIS[0]);
    expect(pickRandom(AVATAR_COLORS, () => 0.999999)).toBe(AVATAR_COLORS[AVATAR_COLORS.length - 1]);
    expect(pickRandom(AVATAR_COLORS, () => 1)).toBe(AVATAR_COLORS[AVATAR_COLORS.length - 1]);
  });
});
