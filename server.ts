// TripTrek China — Custom Next.js + Socket.io Server
// Entry point — connects modular server components
//
// Architecture:
//   server.ts (this)              → main entry, Next.js + Socket.io setup
//   server/emit-handler.ts        → /emit HTTP endpoint (API → WS bridge)
//   server/socket-handlers.ts     → socket.io event handlers
//   server/rooms.ts               → trip rooms management
//   server/notification-map.ts    → notification config (event → emoji+msg)

import { createServer } from "http";
import { Server } from "socket.io";
import type { Server as IOServer } from "socket.io";
import next from "next";
import { handleEmitRequest } from "./server/emit-handler";
import { setupSocketHandlers } from "./server/socket-handlers";
import { TripRooms } from "./server/rooms";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000");

// Workaround: Turbopack has issues resolving @prisma/client (cached hash mismatch)
// Force webpack by setting webpack: true
const app = next({ dev, webpack: true });
const handle = app.getRequestHandler();

// Trip rooms: tracks which sockets are in which trip rooms
const rooms = new TripRooms();

// io is assigned after server creation, but referenced in the HTTP callback.
// Using `let` + type annotation so the closure can access it.
let io: IOServer;

app.prepare().then(() => {
  // HTTP server (Next.js) + /emit endpoint for WS emission from API routes
  const server = createServer((req, res) => {
    // Try to handle /emit first (internal WS bridge)
    if (io && handleEmitRequest(req, res, io)) return;
    // Otherwise — Next.js handler
    handle(req, res);
  });

  // Socket.io server
  io = new Server(server, {
    path: "/socket.io/",
    cors: {
      origin: process.env.WS_ALLOWED_ORIGINS?.split(",") || ["*"],
      methods: ["GET", "POST"],
    },
  });

  // Setup socket event handlers
  setupSocketHandlers(io, rooms);

  // Start HTTP + WS on same port
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> WebSocket on ws://localhost:${port}/socket.io/`);
  });
});
