"use client";

import { useEffect } from "react";

const storageKey = (userId: string) => `tt_time_zone_${userId}`;

/**
 * Сообщает серверу пояс устройства: автонапоминания о долгах уходят днём по часам человека,
 * а в поездке его пояс меняется. Шлём только при смене, значение храним на пользователя
 * (на одном устройстве бывает несколько аккаунтов). Сбой не важен: повторим при следующем открытии.
 */
export function useReportTimeZone(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    try {
      if (localStorage.getItem(storageKey(userId)) === zone) return;
    } catch {
      // приватный режим: просто отправим ещё раз
    }
    void fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: zone }),
    })
      .then((r) => {
        if (!r.ok) return;
        try {
          localStorage.setItem(storageKey(userId), zone);
        } catch {
          // приватный режим
        }
      })
      .catch(() => {});
  }, [userId]);
}
