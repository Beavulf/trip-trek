// Helper для эмиссии WS событий из API routes
// Работает через HTTP POST на внутренний WS-сервис

const WS_INTERNAL_URL = process.env.WS_INTERNAL_URL || "http://localhost:3001";

type WSEvent =
  | "place:visited"
  | "place:created"
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

export async function emitWS(event: WSEvent, data: Record<string, unknown>) {
  try {
    await fetch(`${WS_INTERNAL_URL}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...data }),
    });
  } catch {
    // WS сервер может быть недоступен — silent fail
  }
}
