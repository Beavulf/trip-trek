// Socket.io connection + event handlers
import type { Server as IOServer, Socket } from "socket.io";
import { TripRooms } from "./rooms";
import { SOCKET_EVENTS } from "./notification-map";

export function setupSocketHandlers(io: IOServer, rooms: TripRooms): void {
  io.on("connection", (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Join trip room
    socket.on("trip:join", (tripId: string) => {
      socket.join(`trip:${tripId}`);
      rooms.join(tripId, socket.id);
      console.log(`[WS] ${socket.id} joined trip:${tripId} (${rooms.getRoomSize(tripId)} users)`);
    });

    // Leave trip room
    socket.on("trip:leave", (tripId: string) => {
      socket.leave(`trip:${tripId}`);
      rooms.leave(tripId, socket.id);
      console.log(`[WS] ${socket.id} left trip:${tripId}`);
    });

    // Register all event handlers from SOCKET_EVENTS config
    for (const [eventName, config] of Object.entries(SOCKET_EVENTS)) {
      socket.on(eventName, (data: Record<string, unknown> & { tripId?: string }) => {
        const tripId = data.tripId;
        if (!tripId) return;

        // Broadcast to trip room
        if (config.broadcastEvent) {
          io.to(`trip:${tripId}`).emit(config.broadcastEvent, { ...data });
        }

        // Send notification
        if (config.notification) {
          io.to(`trip:${tripId}`).emit("notification", {
            type: eventName.split(":")[0],
            message: config.notification.message(data),
            emoji: config.notification.emoji,
          });
        }
      });
    }

    // Disconnect
    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
      rooms.removeSocket(socket.id);
    });
  });
}
