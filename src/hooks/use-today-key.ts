"use client";

import { useEffect, useState } from "react";
import { localTodayKey } from "@/lib/lodging";

/**
 * Сегодняшний день по часам устройства, живой. Приложение ставят на экран телефона и не закрывают
 * неделями: значение, посчитанное при входе, к утру показывало вчерашний «сегодня ночуем здесь».
 */
export function useTodayKey(): string {
  const [key, setKey] = useState(() => localTodayKey());

  useEffect(() => {
    const tick = () => setKey(localTodayKey());
    const timer = setInterval(tick, 60_000);
    // На свёрнутом приложении таймеры спят: при возврате сверяемся сразу
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return key;
}
