"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

/** Событие в window при каждом connect — подписчики (board:typing и т.п.)
 *  пересоздают подписку, когда сокет пересоздан после разрыва/смены поездки. */
export const SOCKET_READY_EVENT = "triptrek:socket-ready";

export function useWebSocket(tripId: string) {
  const qc = useQueryClient();
  const connectedRef = useRef(false);
  // Track the current tripId so cleanup can leave the right room
  const currentTripIdRef = useRef<string>("");

  useEffect(() => {
    if (!tripId || connectedRef.current) return;

    // Track the tripId we're about to join so cleanup can leave it
    currentTripIdRef.current = tripId;

    // WebSocket подключается к тому же origin что и страница
    // (server.ts: HTTP + WS на одном порту, Caddy проксирует оба)
    const wsUrl = window.location.origin;

    socket = io(wsUrl, {
      transports: ["websocket", "polling"],
      path: "/socket.io/",
      reconnection: true,
      // Аудит перфоманса 2026-09-13: раньше 10 попыток ~20 c — после сна/лагов
      // realtime умирал до перезагрузки страницы. Теперь retry бесконечный,
      // интервал растёт до 30 c и сбрасывается при успешном connect.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });

    socket.on("connect", () => {
      console.log("[WS] Connected:", socket?.id);
      connectedRef.current = true;
      socket?.emit("trip:join", tripId);
      window.dispatchEvent(new Event(SOCKET_READY_EVENT));
    });

    socket.on("disconnect", () => {
      console.log("[WS] Disconnected");
      connectedRef.current = false;
    });

    // Дебаунс инвалидаций: burst событий (загрузка 10 фото = 10 photo:added)
    // схлопывается в одну волну refetch'ей через 400 мс после последнего события.
    // Свои мутации не страдают: их onSuccess-инвалидации срабатывают мгновенно,
    // а повторный WS-толчок просто попадает в то же окно дебаунса.
    const pendingKeys = new Set<string[]>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateDebounced = (...keys: string[][]) => {
      keys.forEach((k) => pendingKeys.add(k));
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const batch = [...pendingKeys];
        pendingKeys.clear();
        batch.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      }, 400);
    };

    // Real-time events → invalidate queries
    socket.on("place:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["route"], ["trip"]);
    });

    socket.on("place:created", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["route"], ["trip"]);
    });

    socket.on("place:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["route"], ["trip"]);
    });

    socket.on("photo:added", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["photos"], ["photos-geo"], ["route"], ["trip"]);
    });

    socket.on("photo:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["photos"], ["photos-geo"], ["route"], ["trip"]);
    });

    socket.on("expense:added", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["expenses"], ["trip"]);
    });

    // Новый участник присоединился — подтянуть состав (и событие в ленте)
    socket.on("member:joined", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["trip"], ["trips"]);
    });

    socket.on("expense:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["expenses"], ["trip"]);
    });

    socket.on("journal:added", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["journal"], ["trip"]);
    });

    socket.on("journal:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["journal"], ["trip"]);
    });

    socket.on("journal:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["journal"]);
    });

    socket.on("board:added", (data: { tripId: string; userId?: string }) => {
      if (data.tripId === tripId) {
        invalidateDebounced(["board"]);
        // P1 #9: anti double-toast — actor уже видел toast при отправке
        // Toast для других показывается через notification (publish из ws-bus)
      }
    });

    socket.on("board:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["board"]);
    });

    // P1 #7: pin sync — invalidate board (без notification "новое сообщение")
    socket.on("board:pinned", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["board"]);
    });

    // Редактирование / реакции — тихая синхронизация (без тостов и push)
    socket.on("board:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["board"]);
    });

    socket.on("checklist:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["checklist"]);
    });

    socket.on("food:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["foods"]);
    });

    socket.on("phrase:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["phrases"]);
    });

    socket.on("info:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["info"]);
    });

    socket.on("budget:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["budget-plan"], ["trip"]);
    });

    socket.on("trip:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) invalidateDebounced(["trip"]);
    });

    // Toast + push уведомления
    // P1 #9: anti double-toast — исключаем автора (actor уже видел toast при отправке)
    socket.on("notification", (data: { type: string; message: string; emoji: string; actorUserId?: string | null }) => {
      // Бейдж уведомлений теперь живёт на WS-событии; поллинг в useNotifications
      // остался страховочным fallback'ом (60 c)
      qc.invalidateQueries({ queryKey: ["notifications"] });

      // Skip toast for the actor — they already got a local success toast.
      // Also skip broken payloads ("undefined добавил…").
      const currentUserId = typeof window !== "undefined" ? localStorage.getItem("triptrek-current-user-id") : null;
      if (data.actorUserId && currentUserId && data.actorUserId === currentUserId) {
        return;
      }
      if (!data.message || data.message.startsWith("undefined ")) {
        return;
      }

      import("sonner").then(({ toast }) => {
        toast.success(data.message, {
          icon: data.emoji,
          duration: 4000,
        });
      });

      // Отправляем push (если разрешено)
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        navigator.serviceWorker?.ready.then((reg) => {
          reg.showNotification("TripTrek", {
            body: data.message,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: data.type,
            // @ts-expect-error - vibration works on supported devices
      vibrate: [100, 50, 100],
          });
        }).catch(() => {});
      }
    });

    // bfcache: страница с открытым WebSocket не попадает в back/forward cache.
    // При уходе со страницы закрываем сокет, при возврате (persisted) — поднимаем
    // и перезапрашиваем данные: пока страница была заморожена, мир мог измениться.
    const onPageHide = () => {
      socket?.disconnect();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      socket?.connect();
      qc.invalidateQueries();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
        pendingKeys.clear();
      }
      // Leave the old trip room before disconnecting
      const oldTripId = currentTripIdRef.current;
      if (oldTripId && socket?.connected) {
        socket.emit("trip:leave", oldTripId);
      }
      socket?.disconnect();
      socket = null;
      connectedRef.current = false;
      currentTripIdRef.current = "";
    };
  }, [tripId, qc]);
}
