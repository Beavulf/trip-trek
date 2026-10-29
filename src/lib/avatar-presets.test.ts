import { describe, expect, it } from "vitest";
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  PROFILE_EMOJIS,
  isAvatarColor,
  isAvatarEmoji,
  isAvatarUploadUrl,
  isProfileEmoji,
  pickRandom,
} from "./avatar-presets";

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

  it("isProfileEmoji принимает всё из шторки профиля и составные эмодзи", () => {
    for (const e of PROFILE_EMOJIS) expect(isProfileEmoji(e), e).toBe(true);
    expect(isProfileEmoji("👨‍👩‍👧")).toBe(true);
    expect(isProfileEmoji("👍🏽")).toBe(true);
  });

  it("isProfileEmoji отбивает текст, разметку и длинные строки", () => {
    expect(isProfileEmoji("")).toBe(false);
    expect(isProfileEmoji("a")).toBe(false);
    expect(isProfileEmoji("<script>")).toBe(false);
    expect(isProfileEmoji("🦊🦊")).toBe(true); // два пиктографа подряд допустимы — длину режет лимит
    expect(isProfileEmoji("🦊".repeat(20))).toBe(false);
    expect(isProfileEmoji("🦊a")).toBe(false);
    expect(isProfileEmoji(123)).toBe(false);
    expect(isProfileEmoji(null)).toBe(false);
  });

  it("isAvatarUploadUrl принимает только файлы, которые выдаёт загрузка аватара", () => {
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b.jpg")).toBe(true);
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-abc_DEF-1.png")).toBe(true);
  });

  it("isAvatarUploadUrl отбивает обходы пути (чужие файлы через ..)", () => {
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-x/../../photos/victim.jpg")).toBe(false);
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-../x.jpg")).toBe(false);
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-a/b.jpg")).toBe(false);
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-a%2f..%2fb.jpg")).toBe(false);
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-a.jpg?x=1")).toBe(false);
    expect(isAvatarUploadUrl("/uploads/photos/avatar-a.jpg")).toBe(false);
    expect(isAvatarUploadUrl("https://evil.example/uploads/avatars/avatar-a.jpg")).toBe(false);
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-a.svg")).toBe(false);
    expect(isAvatarUploadUrl("/uploads/avatars/avatar-" + "a".repeat(300) + ".jpg")).toBe(false);
    expect(isAvatarUploadUrl(null)).toBe(false);
  });
});
