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

// Набор эмодзи и цветов шторки «Редактировать профиль» (шире, чем при регистрации).
// Список один на клиент и тесты: сервер при PATCH не привязан к нему жёстко — старые профили могли
// выбрать значок из прежней версии списка, — а проверяет форму значения (isProfileEmoji).
export const PROFILE_EMOJIS = [
  "👤", "🧑", "👨", "👩", "🧔", "👱", "😎", "🤓",
  "🥳", "🧑‍🎨", "🐱", "🐶", "🦊", "🐻", "🐼", "🦁",
  "🐸", "🐙", "🦄", "🧳", "✈️", "🌍", "🗺️", "🧭",
  "⛺", "🎒", "🚵", "⛵", "🚂", "🌋", "🏝️", "🏔️",
  "🌴", "📷", "🌟", "🔥", "💎", "🌈", "⭐", "🍀",
] as const;
export const PROFILE_COLORS = [
  "#f97316", "#06b6d4", "#8b5cf6", "#ec4899",
  "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
  "#94a3b8", "#6366f1", "#14b8a6", "#e11d48",
] as const;

// Один эмодзи-«символ»: пиктограмма + модификаторы/вариации/склейки (👨‍👩‍👧, 🧑‍🎨, ✈️, 👍🏽).
// Эмодзи уходит в User.emoji и дублируется в TripMember каждой поездки, а значит рисуется
// всем участникам: произвольная длинная строка раздувала бы строки в БД и ломала вёрстку.
const PROFILE_EMOJI_RE = /^\p{Extended_Pictographic}(?:️|‍|\p{Emoji_Modifier}|\p{Extended_Pictographic})*$/u;

export function isProfileEmoji(v: unknown): v is string {
  return typeof v === "string" && v.length <= 16 && PROFILE_EMOJI_RE.test(v);
}

// Фото профиля, загруженное через POST /api/user/avatar: `/uploads/avatars/avatar-<uuid>.jpg`.
// Имя — только буквы, цифры, «_» и «-» без слэшей и точек (кроме расширения): так в строку нельзя
// протащить `..`. Прежняя проверка «начинается с /uploads/avatars/avatar-» пропускала
// `/uploads/avatars/avatar-x/../../<файл>`: при следующей загрузке аватара сервер удалял бы этот
// чужой файл (storageRemove нормализует путь и остаётся внутри /uploads).
const AVATAR_UPLOAD_URL_RE = /^\/uploads\/avatars\/avatar-[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/;

export function isAvatarUploadUrl(v: unknown): v is string {
  return typeof v === "string" && v.length <= 200 && AVATAR_UPLOAD_URL_RE.test(v);
}
