"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

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
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      console.log("[WS] Connected:", socket?.id);
      connectedRef.current = true;
      socket?.emit("trip:join", tripId);
    });

    socket.on("disconnect", () => {
      console.log("[WS] Disconnected");
      connectedRef.current = false;
    });

    // Real-time events → invalidate queries
    socket.on("place:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["days"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("place:created", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["days"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("place:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["days"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("photo:added", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["photos"] });
        qc.invalidateQueries({ queryKey: ["photos-geo"] });
        qc.invalidateQueries({ queryKey: ["days"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("photo:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["photos"] });
        qc.invalidateQueries({ queryKey: ["photos-geo"] });
        qc.invalidateQueries({ queryKey: ["days"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("expense:added", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["expenses"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("expense:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["expenses"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("journal:added", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["journal"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("journal:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["journal"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("board:added", (data: { tripId: string; userId?: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["board"] });
        // P1 #9: anti double-toast — actor уже видел toast при отправке
        // Toast для других показывается через notification (emit-handler)
      }
    });

    socket.on("board:deleted", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["board"] });
      }
    });

    // P1 #7: pin sync — invalidate board (без notification "новое сообщение")
    socket.on("board:pinned", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["board"] });
      }
    });

    socket.on("checklist:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["checklist"] });
      }
    });

    socket.on("food:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["foods"] });
      }
    });

    socket.on("phrase:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["phrases"] });
      }
    });

    socket.on("info:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["info"] });
      }
    });

    socket.on("budget:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["budget-plan"] });
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    socket.on("trip:updated", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
    });

    // Toast + push уведомления
    // P1 #9: anti double-toast — исключаем автора (actor уже видел toast при отправке)
    socket.on("notification", (data: { type: string; message: string; emoji: string; actorUserId?: string | null }) => {
      // P1 #9: если notification от нас самих — пропускаем toast (уже показали в onSuccess)
      const currentUserId = typeof window !== "undefined" ? localStorage.getItem("triptrek-current-user-id") : null;
      if (data.actorUserId && currentUserId && data.actorUserId === currentUserId) {
        return; // Пропускаем — автор уже видел toast
      }

      // Показываем toast
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

    return () => {
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
