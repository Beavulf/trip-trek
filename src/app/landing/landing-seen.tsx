"use client";

import { useEffect } from "react";
import { LANDING_SEEN_COOKIE } from "./showcase";

// Невидимая отметка «лендинг показан на этом устройстве»: страница-сервер cookie в рендере поставить
// не может. После неё временный редирект «первый визит → лендинг» (LANDING_REDIRECT) больше не срабатывает.
export function LandingSeen() {
  useEffect(() => {
    try {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${LANDING_SEEN_COOKIE}=1; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax${secure}`;
    } catch {
      // cookie запрещены — тогда редирект сработает снова, но кнопки лендинга (mode=…) его обходят
    }
  }, []);
  return null;
}
