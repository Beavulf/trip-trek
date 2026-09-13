import type { Server as IOServer } from "socket.io";
import { NOTIFICATION_MAP } from "../../server/notification-map";

// Realtime-шина (server-only). Next API и custom-server живут в одном
// bun-процессе, поэтому HTTP-мост /emit не нужен: io кладётся в globalThis
// (устойчиво к HMR и дублированию модулей между bun и webpack-рантаймом).
const holder = globalThis as unknown as { __tripIo?: IOServer };

export function setIo(io: IOServer): void {
  holder.__tripIo = io;
}

/**
 * Рассылка события в комнату поездки. Все мутации идут через HTTP API,
 * API-маршрут в конце вызывает publish() — сокет остаётся read-only каналом.
 *
 * Побочно (как раньше делал /emit-хендлер):
 *  - событие "notification" для тостов, если событие есть в NOTIFICATION_MAP;
 *  - Web Push участникам (fire-and-forget; без VAPID-ключей — тихий no-op).
 */
export function publish(tripId: string, event: string, payload: Record<string, unknown> = {}): void {
  const io = holder.__tripIo;
  const n = NOTIFICATION_MAP[event];

  if (io) {
    io.to(`trip:${tripId}`).emit(event, { tripId, ...payload });
    if (n) {
      io.to(`trip:${tripId}`).emit("notification", {
        type: event.split(":")[0],
        message: n.message(payload),
        emoji: n.emoji,
        actorUserId: (payload.userId as string) || null,
      });
    }
  }

  if (n) {
    void import("./push-send")
      .then(({ sendPushToTripMembers }) =>
        sendPushToTripMembers(tripId, {
          title: "TripTrek",
          body: `${n.emoji} ${n.message(payload)}`,
          tag: event,
        })
      )
      .catch(() => {
        // push — вспомогательный канал; сбой не должен ронять запрос
      });
  }
}

/**
 * Исключённого участника выгоняем из комнаты поездки сразу: иначе его открытая
 * вкладка продолжала бы получать события до переподключения (аудит 2026-09-12).
 * Вызывать после удаления TripMember.
 */
export async function evictUserFromTrip(tripId: string, userId: string): Promise<void> {
  const io = holder.__tripIo;
  if (!io) return;
  try {
    const sockets = await io.in(`trip:${tripId}`).fetchSockets();
    for (const s of sockets) {
      if (s.data.userId === userId) s.leave(`trip:${tripId}`);
    }
  } catch {
    // realtime — вспомогательный канал; неудача eviction не роняет HTTP-запрос
  }
}
