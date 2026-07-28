"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  if (socket && socket.connected) return socket;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
  const wsUrl = `${protocol}//${host}:${wsPort}`;

  socket = io(wsUrl, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    autoConnect: true,
  });

  socket.on("connect", () => {
    console.log("[WS] Connected:", socket?.id);
  });

  socket.on("disconnect", () => {
    console.log("[WS] Disconnected");
  });

  socket.on("connect_error", (err) => {
    console.warn("[WS] Connect error:", err.message);
  });

  return socket;
}

export function joinTripRoom(tripId: string) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit("trip:join", { tripId });
  } else if (s) {
    s.on("connect", () => s.emit("trip:join", { tripId }));
  }
}

export function leaveTripRoom(tripId: string) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit("trip:leave", { tripId });
  }
}

// Типы событий
export type WSEvent =
  | { type: "place:visited"; tripId: string; placeId: string; userId: string }
  | { type: "place:added"; tripId: string; place: unknown }
  | { type: "photo:added"; tripId: string; photo: unknown }
  | { type: "expense:added"; tripId: string; expense: unknown }
  | { type: "journal:added"; tripId: string; entry: unknown }
  | { type: "message:added"; tripId: string; message: unknown }
  | { type: "checklist:toggled"; tripId: string; itemId: string; done: boolean }
  | { type: "food:tried"; tripId: string; foodId: string; tried: boolean };

export function onTripEvent(tripId: string, callback: (event: WSEvent) => void) {
  const s = getSocket();
  if (!s) return () => {};

  const handler = (event: WSEvent) => {
    if (event.tripId === tripId) {
      callback(event);
    }
  };

  s.on("trip:event", handler);
  return () => {
    s.off("trip:event", handler);
  };
}
