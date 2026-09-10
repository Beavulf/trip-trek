// Notification configuration for realtime events
// Maps event names to emoji + message generator.
// Потребитель — src/lib/ws-bus.ts (publish): тост "notification" в комнате
// + Web Push участникам. Сокет-слой события не конфигурирует (read-only канал).

export interface NotificationConfig {
  emoji: string;
  message: (data: Record<string, unknown>) => string;
}

export const NOTIFICATION_MAP: Record<string, NotificationConfig> = {
  "place:visited": {
    emoji: "📍",
    message: (d) => `${d.userName || "Кто-то"} отметил(а) место посещённым: ${d.placeName}`,
  },
  "place:created": {
    emoji: "📍",
    message: (d) => `${d.userName || "Кто-то"} добавил(а) место: ${d.placeName}`,
  },
  "photo:added": {
    emoji: "📸",
    message: (d) => `${d.userName || "Кто-то"} добавил(а) фото`,
  },
  "expense:added": {
    emoji: "💸",
    message: (d) =>
      `${d.userName || d.paidByName || "Кто-то"} добавил(а) трату: ${d.currencySymbol || "$"}${d.amount} — ${d.description}`,
  },
  "journal:added": {
    emoji: "📔",
    message: (d) => `${d.userName || "Кто-то"} написал(а) в дневник ${d.mood || ""}`.trim(),
  },
  "board:added": {
    emoji: "💬",
    message: (d) => `${d.userName || "Кто-то"}: ${String(d.content || "").slice(0, 50)}`,
  },
};
