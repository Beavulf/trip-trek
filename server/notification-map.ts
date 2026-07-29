// Notification configuration for WebSocket events
// Maps event names to emoji + message generator

export interface NotificationConfig {
  emoji: string;
  message: (data: Record<string, unknown>) => string;
}

export const NOTIFICATION_MAP: Record<string, NotificationConfig> = {
  "place:visited": {
    emoji: "📍",
    message: (d) => `${d.userName} отметил(а): ${d.placeName}`,
  },
  "place:created": {
    emoji: "📍",
    message: (d) => `${d.userName} добавил(а) место: ${d.placeName}`,
  },
  "photo:added": {
    emoji: "📸",
    message: (d) => `${d.userName} добавил(а) фото`,
  },
  "expense:added": {
    emoji: "💸",
    message: (d) => `${d.userName} добавил(а) трату: $${d.amount} — ${d.description}`,
  },
  "journal:added": {
    emoji: "📔",
    message: (d) => `${d.userName} написал(а) в дневник ${d.mood || ""}`,
  },
  "board:added": {
    emoji: "💬",
    message: (d) => `${d.userName}: ${String(d.content || "").slice(0, 50)}`,
  },
};

// Socket event handlers config: maps event → broadcast event + notification
export interface SocketEventConfig {
  broadcastEvent?: string;
  notification?: {
    emoji: string;
    message: (data: Record<string, unknown>) => string;
  };
}

export const SOCKET_EVENTS: Record<string, SocketEventConfig> = {
  "place:visited": {
    broadcastEvent: "place:updated",
    notification: {
      emoji: "📍",
      message: (d) => `${d.userName} отметил(а): ${d.placeName}`,
    },
  },
  "place:created": {
    broadcastEvent: "place:created",
    notification: {
      emoji: "📍",
      message: (d) => `${d.userName} добавил(а) место: ${d.placeName}`,
    },
  },
  "place:deleted": {
    broadcastEvent: "place:deleted",
  },
  "photo:added": {
    broadcastEvent: "photo:added",
    notification: {
      emoji: "📸",
      message: (d) => `${d.userName} добавил(а) фото`,
    },
  },
  "expense:added": {
    broadcastEvent: "expense:added",
    notification: {
      emoji: "💸",
      message: (d) => `${d.userName} добавил(а) трату: $${d.amount} — ${d.description}`,
    },
  },
  "expense:deleted": {
    broadcastEvent: "expense:deleted",
  },
  "journal:added": {
    broadcastEvent: "journal:added",
    notification: {
      emoji: "📔",
      message: (d) => `${d.userName} написал(а) в дневник ${d.mood || ""}`,
    },
  },
  "journal:deleted": {
    broadcastEvent: "journal:deleted",
  },
  "board:added": {
    broadcastEvent: "board:added",
    notification: {
      emoji: "💬",
      message: (d) => `${d.userName}: ${String(d.content || "").slice(0, 50)}`,
    },
  },
  "board:deleted": {
    broadcastEvent: "board:deleted",
  },
  "board:pinned": {
    broadcastEvent: "board:added",
  },
  "checklist:updated": {
    broadcastEvent: "checklist:updated",
  },
  "food:updated": {
    broadcastEvent: "food:updated",
  },
  "phrase:updated": {
    broadcastEvent: "phrase:updated",
  },
  "info:updated": {
    broadcastEvent: "info:updated",
  },
  "budget:updated": {
    broadcastEvent: "budget:updated",
  },
  "trip:updated": {
    broadcastEvent: "trip:updated",
  },
};
