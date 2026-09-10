// TripTrek — Custom Next.js + Socket.io Server
// Entry point — connects modular server components
//
// Architecture:
//   server.ts (this)              → main entry, Next.js + Socket.io setup
//   server/socket-handlers.ts     → socket.io event handlers (read-only канал)
//   server/rooms.ts               → trip rooms management
//   server/notification-map.ts    → notification config (event → emoji+msg)
//   src/lib/ws-bus.ts             → publish() шина для API-маршрутов

import { createServer } from "http";
import { Server } from "socket.io";
import type { Server as IOServer } from "socket.io";
import next from "next";
import { db } from "./src/lib/db";
import { setIo } from "./src/lib/ws-bus";
import { setupSocketHandlers } from "./server/socket-handlers";
import { wsHandshakeAuth } from "./server/ws-auth";
import { TripRooms } from "./server/rooms";
import { handleUploadsRequest } from "./server/static-uploads";

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
  // HTTP server (Next.js) + runtime /uploads from disk volume
  const server = createServer((req, res) => {
    // Runtime uploads (Docker volume) — must bypass Next static snapshot
    if (handleUploadsRequest(req, res)) return;
    // Otherwise — Next.js handler (HTTP-мост /emit удалён: API-маршруты
    // сидят в этом же процессе и зовут publish() из ws-bus напрямую)
    handle(req, res);
  });

  // Socket.io server: handshake требует валидный JWT из cookie сессии —
  // анонимные подключения отбиваются сразу
  io = new Server(server, {
    path: "/socket.io/",
    cors: {
      origin: process.env.WS_ALLOWED_ORIGINS?.split(",") || ["*"],
      methods: ["GET", "POST"],
    },
  });

  io.use(wsHandshakeAuth);

  // Регистрируем io в шине — теперь API-маршруты зовут publish(tripId, event, …)
  setIo(io);

  // Setup socket event handlers
  setupSocketHandlers(io, rooms);

  // Start HTTP + WS on all interfaces (Docker / LAN)
  server.listen(port, "0.0.0.0", () => {
    console.log(`> Ready on http://0.0.0.0:${port}`);
    console.log(`> WebSocket on ws://0.0.0.0:${port}/socket.io/`);
  });

  // Graceful shutdown: докер шлёт SIGTERM, ждёт stop_grace_period и шлёт SIGKILL.
  // Порядок: перестать принимать WS → добить HTTP → закрыть пул Prisma.
  const shutdown = (signal: string) => {
    console.log(`> ${signal} received, shutting down…`);
    io.close(() => {
      server.close(() => {
        db.$disconnect().finally(() => process.exit(0));
      });
    });
    // Failsafe: если что-то зависло в close-колбэках — выходим принудительно
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
