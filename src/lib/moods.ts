// Единый список настроений для Journal и QuickAdd JournalForm.
// P2 #13: раньше был отдельный массив в journal.tsx (10 эмоций) и JournalForm (8) — расходились.
export const MOODS = ["😊", "🤩", "😴", "🤤", "🥳", "🤔", "😍", "😰", "🔥", "💖"] as const;

export type Mood = (typeof MOODS)[number];

// P1 #10: whitelist для валидации на сервере
export function isValidMood(m: string | null | undefined): m is Mood {
  if (!m) return false;
  return (MOODS as readonly string[]).includes(m);
}
