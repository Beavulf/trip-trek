// Socket.io connection + event handlers
// Сокет — read-only канал: вход в комнату поездки, выход и индикатор набора
// текста в чате. Все мутации — через HTTP API; любые другие client→server
// события игнорируются. Аутентификация — JWT на handshake (server.ts).
import type { Server, Socket } from "socket.io";
import { db } from "../src/lib/db";
import { TripRooms } from "./rooms";

export function setupSocketHandlers(io: Server, rooms: TripRooms): void {
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    console.log(`[WS] Client connected: ${socket.id} (user ${userId})`);

    // Кэш членства в рамках сокета: положительный результат кэшируется,
    // отрицательный — нет (участник мог только что присоединиться по инвайту)
    const memberOf = new Map<string, Promise<boolean>>();
    const checkMembership = (tripId: string): Promise<boolean> => {
      let p = memberOf.get(tripId);
      if (!p) {
        p = db.tripMember
          .findUnique({
            where: { tripId_userId: { tripId, userId } },
            select: { id: true },
          })
          .then((m) => {
            const ok = !!m;
            if (!ok) memberOf.delete(tripId);
            return ok;
          })
          .catch(() => false);
        memberOf.set(tripId, p);
      }
      return p;
    };

    // Входящая полезная нагрузка ненадёжна по умолчанию — валидируем типы
    socket.on("trip:join", async (tripId: unknown) => {
      if (typeof tripId !== "string" || tripId.length === 0 || !(await checkMembership(tripId))) {
        socket.emit("trip:error", { error: "not a member" });
        return;
      }
      socket.join(`trip:${tripId}`);
      rooms.join(tripId, socket.id);
      console.log(`[WS] ${socket.id} joined trip:${tripId} (${rooms.getRoomSize(tripId)} users)`);
    });

    // Leave trip room
    socket.on("trip:leave", (tripId: unknown) => {
      if (typeof tripId !== "string") return;
      socket.leave(`trip:${tripId}`);
      rooms.leave(tripId, socket.id);
    });

    // «Печатает…» в чате: ретрансляция в комнату БЕЗ отправителя (socket.to),
    // только участникам той же поездки. userName приходит от клиента —
    // обрезаем: это лишь подпись в тосте, а не поле данных.
    socket.on("board:typing", async (data: unknown) => {
      const d = data as { tripId?: unknown; userName?: unknown } | null;
      if (typeof d?.tripId !== "string" || !(await checkMembership(d.tripId))) return;
      socket.to(`trip:${d.tripId}`).emit("board:typing", {
        tripId: d.tripId,
        userName:
          typeof d.userName === "string" && d.userName
            ? d.userName.slice(0, 32)
            : "Кто-то",
      });
    });

    socket.on("disconnect", () => {
      rooms.removeSocket(socket.id);
    });
  });
}
