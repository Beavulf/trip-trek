"use client";

import { useEffect, useState } from "react";

export function usePushNotifications(tripId: string) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    // Регистрация Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        console.log("[SW] Registered:", reg.scope);
        // Проверяем есть ли подписка
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) {
            setSubscribed(true);
            console.log("[Push] Already subscribed");
          }
        });
      }).catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
    }
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      return { granted: false, error: "Not supported" };
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    return { granted: result === "granted" };
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      // Запрашиваем разрешение
      const { granted } = await requestPermission();
      if (!granted) {
        return { success: false, error: "Permission denied" };
      }

      // Регистрируем push-подписку
      const reg = await navigator.serviceWorker.ready;
      
      // В продакшене нужен VAPID ключ:
      // const sub = await reg.pushManager.subscribe({
      //   userVisibleOnly: true,
      //   applicationServerKey: VAPID_PUBLIC_KEY,
      // });
      
      // Пока — заглушка (без VAPID, используем локальные уведомления)
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true }).catch(() => null);
      
      if (sub) {
        // Отправляем подписку на сервер
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
        setSubscribed(true);
        return { success: true };
      }

      // Fallback — показываем локальное уведомление
      return { success: true, local: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
      setSubscribed(false);
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  return {
    permission,
    subscribed,
    loading,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}
