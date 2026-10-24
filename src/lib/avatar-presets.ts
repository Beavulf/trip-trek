// Значки профиля, которые можно выбрать при регистрации. Список общий для формы входа и
// сервера: register принимает только значения отсюда, произвольная строка в User.emoji/color
// не попадёт (эти поля показываются всем участникам поездки и подставляются в стили).

export const AVATAR_EMOJIS = ["🦊", "🐻", "🐼", "🦁", "🐯", "🐨", "🐸", "🐵", "🦉", "🐧", "🦄", "🐲"] as const;
export const AVATAR_COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"] as const;

export function isAvatarEmoji(v: unknown): v is (typeof AVATAR_EMOJIS)[number] {
  return typeof v === "string" && (AVATAR_EMOJIS as readonly string[]).includes(v);
}

export function isAvatarColor(v: unknown): v is (typeof AVATAR_COLORS)[number] {
  return typeof v === "string" && (AVATAR_COLORS as readonly string[]).includes(v);
}

/** Случайный элемент списка; rnd подменяется в тестах. */
export function pickRandom<T>(list: readonly T[], rnd: () => number = Math.random): T {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}
