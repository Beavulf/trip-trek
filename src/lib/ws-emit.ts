// Helper для эмиссии WS событий из API routes
// Работает через HTTP POST на тот же порт что и Next.js (server.ts перехватывает /emit)

const WS_INTERNAL_URL = process.env.WS_INTERNAL_URL || "http://localhost:3000";

type WSEvent =
  | "place:visited"
  | "place:created"
  | "place:updated"
  | "place:deleted"
  | "photo:added"
  | "expense:added"
  | "expense:deleted"
  | "journal:added"
  | "journal:deleted"
  | "board:added"
  | "board:deleted"
  | "board:pinned"
  | "checklist:updated"
  | "food:updated"
  | "phrase:updated"
  | "info:updated"
  | "budget:updated"
  | "trip:updated";

export async function emitWS(event: WSEvent, tripId: string, data?: Record<string, unknown>) {
  try {
    await fetch(`${WS_INTERNAL_URL}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, tripId, ...data }),
    });
  } catch {
    // WS сервер может быть недоступен — silent fail
  }
}
