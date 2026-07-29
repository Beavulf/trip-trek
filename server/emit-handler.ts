// HTTP /emit endpoint handler — receives WS events from API routes
import type { Server as IOServer } from "socket.io";
import { NOTIFICATION_MAP } from "./notification-map";

export function handleEmitRequest(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
  io: IOServer
): boolean {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method !== "POST" || parsedUrl.pathname !== "/emit") {
    return false; // Not an /emit request — let Next.js handle it
  }

  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk;
  });
  req.on("end", () => {
    try {
      const { event, tripId, ...data } = JSON.parse(body);
      if (event && tripId) {
        // Broadcast to trip room
        io.to(`trip:${tripId}`).emit(event, { tripId, ...data });

        // Also send notification for toast
        const notif = NOTIFICATION_MAP[event];
        if (notif) {
          io.to(`trip:${tripId}`).emit("notification", {
            type: event.split(":")[0],
            message: notif.message(data),
            emoji: notif.emoji,
          });
        }
      }
    } catch {
      // Invalid JSON — ignore
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  return true; // Handled
}
