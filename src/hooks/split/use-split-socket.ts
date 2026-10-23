"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCents } from "@/lib/split/money";
import { splitKeys } from "./api";

// Realtime «Сочтёмся»: тот же socket.io, комнаты `group:<id>`. Страницы /split и / не смонтированы
// одновременно, поэтому свой сокет не конфликтует с useWebSocket поездки. Хаб подписывается на все свои
// группы, экран группы — на одну; событие делает инвалидацию кэша и (для чужих действий) мягкий тост.

interface SplitChangedEvent {
  groupId: string;
  kind: string;
  actorUserId: string | null;
  actorName?: string;
  description?: string;
  amountCents?: number;
  currency?: string;
}

function toastText(e: SplitChangedEvent): string | null {
  const who = e.actorName || "Кто-то";
  const sum = e.amountCents && e.currency ? ` · ${formatCents(e.amountCents, e.currency)}` : "";
  switch (e.kind) {
    case "expense.created":
      return `${who} добавил(а) «${e.description ?? "трату"}»${sum}`;
    case "expense.updated":
      return `${who} изменил(а) «${e.description ?? "трату"}»${sum}`;
    case "expense.deleted":
      return `${who} удалил(а) «${e.description ?? "трату"}»`;
    case "payment.created":
      return `${who} отметил(а) перевод${sum}`;
    default:
      return null;
  }
}

export function useSplitSocket(groupIds: string[], myUserId: string | undefined) {
  const qc = useQueryClient();
  const idsRef = useRef<string[]>(groupIds);
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef<Set<string>>(new Set());
  const userRef = useRef(myUserId);

  useEffect(() => {
    userRef.current = myUserId;
  }, [myUserId]);

  // Одно соединение на жизнь страницы
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      path: "/socket.io/",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });
    socketRef.current = socket;

    // Пачка событий (несколько трат подряд) схлопывается в один рефетч на группу
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const refresh = (groupId: string) => {
      if (timers.has(groupId)) return;
      timers.set(
        groupId,
        setTimeout(() => {
          timers.delete(groupId);
          void qc.invalidateQueries({ queryKey: splitKeys.ledger(groupId) });
          void qc.invalidateQueries({ queryKey: splitKeys.group(groupId) });
          void qc.invalidateQueries({ queryKey: splitKeys.groups });
          void qc.invalidateQueries({ queryKey: splitKeys.activity(groupId) });
        }, 250)
      );
    };

    const onConnect = () => {
      // После обрыва комнаты на сервере потеряны — подписываемся заново
      joinedRef.current = new Set(idsRef.current);
      if (idsRef.current.length) socket.emit("split:join", idsRef.current);
    };
    socket.on("connect", onConnect);
    socket.on("split:changed", (e: SplitChangedEvent) => {
      refresh(e.groupId);
      if (e.actorUserId && e.actorUserId === userRef.current) return; // своё действие уже видно
      const text = toastText(e);
      if (text) toast(text, { duration: 3500 });
    });

    return () => {
      timers.forEach(clearTimeout);
      socket.off("connect", onConnect);
      socket.disconnect();
      socketRef.current = null;
      joinedRef.current = new Set();
    };
  }, [qc]);

  // Состав подписок меняется (открыли другую группу, вступили в новую)
  const key = groupIds.join(",");
  useEffect(() => {
    idsRef.current = groupIds;
    const socket = socketRef.current;
    if (!socket?.connected) return; // подпишется в onConnect
    const next = new Set(groupIds);
    const left = [...joinedRef.current].filter((id) => !next.has(id));
    const added = groupIds.filter((id) => !joinedRef.current.has(id));
    if (left.length) socket.emit("split:leave", left);
    if (added.length) socket.emit("split:join", added);
    joinedRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupIds сведён к строке key
  }, [key]);
}
