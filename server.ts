// TripTrek — Custom Next.js + Socket.io Server
// Entry point — connects modular server components
//
// Architecture:
//   server.ts (this)              → main entry, Next.js + Socket.io setup
//   server/ws-auth.ts             → JWT handshake для socket.io
//   server/socket-handlers.ts     → socket.io event handlers (read-only канал)
//   server/rooms.ts               → trip rooms management
//   server/notification-map.ts    → notification config (event → emoji+msg)
//   src/lib/ws-bus.ts             → publish() шина для API-маршрутов
//
// Next 16 рассчитывает на глобальный AsyncLocalStorage (вебпак-сборка next
// start его инжектит, а custom-server под bun — нет: модуль async-local-storage
// видит undefined и ставит Fake, который кидает инвариант на первом же
// unhandled-rejection). Подставляем настоящий node:async_hooks ALS ДО любого
// импорта next.
import { AsyncLocalStorage } from "node:async_hooks";

if (typeof (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage === "undefined") {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
}

// Необработанные реджекты печатаем ЧЕРЕЗ stderr напрямую: next патчит
// console.* через ALS — вызов console.error в этих обработчиках под bun
// сам взрывается инвариантом.
process.on("unhandledRejection", (reason) => {
  const text = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(`[unhandledRejection] ${text}\n`);
});
process.on("uncaughtException", (err) => {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[uncaughtException] ${text}\n`);
  process.exit(1);
});

const [{ createServer }, { Server }, { default: next }, { db }, { setIo }, { setupSocketHandlers }, { wsHandshakeAuth }, { TripRooms }, { handleUploadsRequest }] =
  await Promise.all([
    import("http"),
    import("socket.io"),
    import("next"),
    import("./src/lib/db"),
    import("./src/lib/ws-bus"),
    import("./server/socket-handlers"),
    import("./server/ws-auth"),
    import("./server/rooms"),
    import("./server/static-uploads"),
  ]);

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
let io: import("socket.io").Server;

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

export {};
