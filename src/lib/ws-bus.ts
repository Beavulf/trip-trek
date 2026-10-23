import type { Server as IOServer } from "socket.io";
import { NOTIFICATION_MAP } from "../../server/notification-map";

// Realtime-шина (server-only). Next API и custom-server живут в одном
// bun-процессе, поэтому HTTP-мост /emit не нужен: io кладётся в globalThis
// (устойчиво к HMR и дублированию модулей между bun и webpack-рантаймом).
const holder = globalThis as unknown as { __tripIo?: IOServer };

export function setIo(io: IOServer): void {
  holder.__tripIo = io;
}

export interface PublishOpts {
  /**
   * Тихая публикация: само событие уходит (клиенты инвалидируют кэш), но тост
   * «notification» и Web Push не летят. Для батчевых мутаций (мультизагрузка
   * фото): 50 отдельных POST не должны оборачиваться 50 пушами друзьям —
   * клиент помечает все, кроме последнего, silent, а последний несёт count.
   */
  silent?: boolean;
}

/**
 * Рассылка события в комнату поездки. Все мутации идут через HTTP API,
 * API-маршрут в конце вызывает publish() — сокет остаётся read-only каналом.
 *
 * Побочно (как раньше делал /emit-хендлер):
 *  - событие "notification" для тостов, если событие есть в NOTIFICATION_MAP;
 *  - Web Push участникам (fire-and-forget; без VAPID-ключей — тихий no-op).
 *
 * actorId — автор мутации: ему не шлём push (своё событие он уже видел тостом),
 * а ws-тост клиент выкинет по actorUserId. Фолбэк — userId из payload
 * (expenses/photos/board кладут его сами).
 */
export function publish(
  tripId: string,
  event: string,
  payload: Record<string, unknown> = {},
  actorId?: string | null,
  opts?: PublishOpts
): void {
  const io = holder.__tripIo;
  const n = opts?.silent ? undefined : NOTIFICATION_MAP[event];
  const actor = actorId ?? ((payload.userId as string) || null);

  if (io) {
    io.to(`trip:${tripId}`).emit(event, { tripId, ...payload });
    if (n) {
      io.to(`trip:${tripId}`).emit("notification", {
        type: event.split(":")[0],
        message: n.message(payload),
        emoji: n.emoji,
        actorUserId: actor,
      });
    }
  }

  if (n) {
    void import("./push-send")
      .then(({ sendPushToTripMembers }) =>
        sendPushToTripMembers(
          tripId,
          {
            title: "TripTrek",
            body: `${n.emoji} ${n.message(payload)}`,
            tag: event,
          },
          { exceptUserId: actor }
        )
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

/**
 * Рассылка в произвольную комнату (не только `trip:<id>`): «Сочтёмся» живёт в комнатах `group:<id>`.
 * Без тостов и пушей из NOTIFICATION_MAP — группы шлют свои персональные уведомления сами
 * (src/lib/split/notify.ts): текст зависит от получателя («твоя доля 15 Br»).
 */
export function publishRoom(room: string, event: string, payload: Record<string, unknown> = {}): void {
  holder.__tripIo?.to(room).emit(event, payload);
}

/** Убрать пользователя из комнаты сразу после выхода/исключения (см. evictUserFromTrip). */
export async function evictUserFromRoom(room: string, userId: string): Promise<void> {
  const io = holder.__tripIo;
  if (!io) return;
  try {
    const sockets = await io.in(room).fetchSockets();
    for (const s of sockets) {
      if (s.data.userId === userId) s.leave(room);
    }
  } catch {
    // realtime — вспомогательный канал; неудача eviction не роняет HTTP-запрос
  }
}
