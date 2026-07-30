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

  useEffect(() => {
    if (!tripId || connectedRef.current) return;

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

    socket.on("board:added", (data: { tripId: string }) => {
      if (data.tripId === tripId) {
        qc.invalidateQueries({ queryKey: ["board"] });
      }
    });

    socket.on("board:deleted", (data: { tripId: string }) => {
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
    socket.on("notification", (data: { type: string; message: string; emoji: string }) => {
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
      socket?.disconnect();
      socket = null;
      connectedRef.current = false;
    };
  }, [tripId, qc]);
}
