// Единый источник правды для chill-категорий.
// Используется в: rest-chill/RestChill.tsx (фильтр мест из маршрута),
// trip-map.tsx (toggle "только кафе/бары/рестораны"), и любом другом месте.
// P2 #18: синхронизация CHILL_CATEGORIES с mapOnlyChill на карте.
export const CHILL_CATEGORIES = ["cafe", "bar", "restaurant"] as const;

export type ChillCategory = (typeof CHILL_CATEGORIES)[number];

export function isChillCategory(category: string): category is ChillCategory {
  return (CHILL_CATEGORIES as readonly string[]).includes(category);
}

// Лейблы для UI
export const CHILL_CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  cafe: { label: "Кафе", emoji: "☕" },
  bar: { label: "Бары", emoji: "🍸" },
  restaurant: { label: "Рестораны", emoji: "🍽️" },
};
