"use client";

// Общее для страниц «Еда»: набор иконок блюд и лёгкий тип участника
export const FOOD_EMOJIS = [
  "🍽️", "🍜", "🥟", "🍣", "🍕", "🍔", "🥘", "🍲", "🌮", "🥗",
  "🍖", "🦆", "🍤", "🥩", "🍛", "🧆", "🥙", "🍰", "🧋", "🍺",
  "🥠", "🍧", "🦐", "🧇",
];

export interface ParticipantLite {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

/** Цвета городов: различимые хюи вместо одинакового оранжевого */
export const CITY_PALETTE = [
  "#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981",
  "#f59e0b", "#ef4444", "#3b82f6", "#84cc16", "#a855f7",
];
