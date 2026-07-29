import { createServer } from "http";
import { Server } from "socket.io";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3000;
const wsPort = parseInt(process.env.WS_PORT || "3001");

const app = next({ dev });
const handle = app.getRequestHandler();

// Trip rooms: Map<tripId, Set<socketId>>
const tripRooms = new Map<string, Set<string>>();

app.prepare().then(() => {
  // HTTP server (Next.js) + /emit endpoint для WS-эмиттеров из API
  const server = createServer((req, res) => {
    // Внутренний endpoint для эмиссии WS событий из API routes
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host}`);
    if (req.method === "POST" && parsedUrl.pathname === "/emit") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { event, tripId, ...data } = JSON.parse(body);
          if (event && tripId) {
            io.to(`trip:${tripId}`).emit(event, { tripId, ...data });
            // Также отправляем notification для toast
            const notifMap: Record<string, { emoji: string; msg: (d: Record<string, unknown>) => string }> = {
              "place:visited": { emoji: "📍", msg: (d) => `${d.userName} отметил(а): ${d.placeName}` },
              "place:created": { emoji: "📍", msg: (d) => `${d.userName} добавил(а) место: ${d.placeName}` },
              "photo:added": { emoji: "📸", msg: (d) => `${d.userName} добавил(а) фото` },
              "expense:added": { emoji: "💸", msg: (d) => `${d.userName} добавил(а) трату: $${d.amount} — ${d.description}` },
              "journal:added": { emoji: "📔", msg: (d) => `${d.userName} написал(а) в дневник ${d.mood || ""}` },
              "board:added": { emoji: "💬", msg: (d) => `${d.userName}: ${String(d.content || "").slice(0, 50)}` },
            };
            const notif = notifMap[event];
            if (notif) {
              io.to(`trip:${tripId}`).emit("notification", {
                type: event.split(":")[0],
                message: notif.msg(data),
                emoji: notif.emoji,
              });
            }
          }
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    handle(req, res);
  });

  // Socket.io server
  const io = new Server(server, {
    path: "/socket.io/",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Join trip room
    socket.on("trip:join", (tripId: string) => {
      socket.join(`trip:${tripId}`);
      if (!tripRooms.has(tripId)) tripRooms.set(tripId, new Set());
      tripRooms.get(tripId)?.add(socket.id);
      console.log(`[WS] ${socket.id} joined trip:${tripId} (${tripRooms.get(tripId)?.size || 0} users)`);
    });

    // Leave trip room
    socket.on("trip:leave", (tripId: string) => {
      socket.leave(`trip:${tripId}`);
      tripRooms.get(tripId)?.delete(socket.id);
      console.log(`[WS] ${socket.id} left trip:${tripId}`);
    });

    // Broadcast events to trip room
    const broadcastToTrip = (event: string, tripId: string, data?: unknown) => {
      io.to(`trip:${tripId}`).emit(event, { tripId, ...((data as Record<string, unknown>) || {}) });
    };

    socket.on("place:visited", (data: { tripId: string; placeId: string; placeName: string; userName: string }) => {
      broadcastToTrip("place:updated", data.tripId, data);
      io.to(`trip:${data.tripId}`).emit("notification", {
        type: "place",
        message: `${data.userName} отметил(а): ${data.placeName}`,
        emoji: "📍",
      });
    });

    socket.on("place:created", (data: { tripId: string; placeName: string; userName: string }) => {
      broadcastToTrip("place:created", data.tripId, data);
      io.to(`trip:${data.tripId}`).emit("notification", {
        type: "place",
        message: `${data.userName} добавил(а) место: ${data.placeName}`,
        emoji: "📍",
      });
    });

    socket.on("place:deleted", (data: { tripId: string; placeId: string }) => {
      broadcastToTrip("place:deleted", data.tripId, data);
    });

    socket.on("photo:added", (data: { tripId: string; userName: string }) => {
      broadcastToTrip("photo:added", data.tripId, data);
      io.to(`trip:${data.tripId}`).emit("notification", {
        type: "photo",
        message: `${data.userName} добавил(а) фото 📸`,
        emoji: "📸",
      });
    });

    socket.on("expense:added", (data: { tripId: string; amount: number; description: string; userName: string }) => {
      broadcastToTrip("expense:added", data.tripId, data);
      io.to(`trip:${data.tripId}`).emit("notification", {
        type: "expense",
        message: `${data.userName} добавил(а) трату: $${data.amount} — ${data.description}`,
        emoji: "💸",
      });
    });

    socket.on("expense:deleted", (data: { tripId: string; expenseId: string }) => {
      broadcastToTrip("expense:deleted", data.tripId, data);
    });

    socket.on("journal:added", (data: { tripId: string; userName: string; mood: string }) => {
      broadcastToTrip("journal:added", data.tripId, data);
      io.to(`trip:${data.tripId}`).emit("notification", {
        type: "journal",
        message: `${data.userName} написал(а) в дневник ${data.mood || ""}`,
        emoji: "📔",
      });
    });

    socket.on("journal:deleted", (data: { tripId: string; journalId: string }) => {
      broadcastToTrip("journal:deleted", data.tripId, data);
    });

    socket.on("board:added", (data: { tripId: string; userName: string; content: string }) => {
      broadcastToTrip("board:added", data.tripId, data);
      io.to(`trip:${data.tripId}`).emit("notification", {
        type: "board",
        message: `${data.userName}: ${data.content.slice(0, 50)}`,
        emoji: "💬",
      });
    });

    socket.on("board:deleted", (data: { tripId: string; messageId: string }) => {
      broadcastToTrip("board:deleted", data.tripId, data);
    });

    socket.on("board:pinned", (data: { tripId: string; messageId: string }) => {
      io.to(`trip:${data.tripId}`).emit("board:added", { tripId: data.tripId });
    });

    socket.on("checklist:updated", (data: { tripId: string }) => {
      broadcastToTrip("checklist:updated", data.tripId, data);
    });

    socket.on("food:updated", (data: { tripId: string }) => {
      broadcastToTrip("food:updated", data.tripId, data);
    });

    socket.on("phrase:updated", (data: { tripId: string }) => {
      broadcastToTrip("phrase:updated", data.tripId, data);
    });

    socket.on("info:updated", (data: { tripId: string }) => {
      broadcastToTrip("info:updated", data.tripId, data);
    });

    socket.on("budget:updated", (data: { tripId: string }) => {
      broadcastToTrip("budget:updated", data.tripId, data);
    });

    socket.on("trip:updated", (data: { tripId: string }) => {
      broadcastToTrip("trip:updated", data.tripId, data);
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
      tripRooms.forEach((members, tripId) => {
        members.delete(socket.id);
        if (members.size === 0) tripRooms.delete(tripId);
      });
    });
  });

  // Start HTTP + WS on same port
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> WebSocket on ws://localhost:${port}/socket.io/`);
  });
});
