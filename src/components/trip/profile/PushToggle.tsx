"use client";

import { useEffect, useState } from "react";
import { useAuth as useSession } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PushToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  });
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id || "";

  useEffect(() => {
    if (!supported) return;
    checkStatus();
  }, [supported]);

  const checkStatus = async () => {
    try {
      // Permission должен быть granted
      if (Notification.permission !== "granted") {
        setEnabled(false);
        return;
      }
      // Проверяем подписку
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub);
    } catch {
      setEnabled(false);
    }
  };

  const toggle = async () => {
    if (!supported) {
      toast.error("Push не поддерживается", {
        description: "Открой через Chrome/Safari, не через встроенный браузер",
      });
      return;
    }

    setLoading(true);
    try {
      if (enabled) {
        // ВЫКЛЮЧАЕМ — удаляем все подписки
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await sub.unsubscribe();
            await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
              method: "DELETE",
            });
          }
        } catch (e) {
          console.warn("SW unsubscribe error:", e);
        }
        // Также удаляем все подписки пользователя с сервера
        await fetch(`/api/push/subscribe?userId=${userId}`, { method: "DELETE" }).catch(() => {});
        setEnabled(false);
        toast.success("Уведомления отключены");
      } else {
        // ВКЛЮЧАЕМ
        // Сначала регистрируем SW если ещё не зарегистрирован
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Запрашиваем permission
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast.error("Разрешение не дано", {
            description: "Разреши уведомления в настройках браузера",
          });
          return;
        }

        // Получаем VAPID ключ
        const vapidRes = await fetch("/api/push/vapid-public-key");
        const { publicKey } = await vapidRes.json();
        if (!publicKey) {
          toast.error("Push не настроен на сервере");
          return;
        }

        // Подписываемся
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            subscription: subscription.toJSON(),
          }),
        });

        setEnabled(true);
        toast.success("Уведомления включены 🔔", {
          description: "Будешь получать push даже при закрытом приложении",
        });
      }
    } catch (e) {
      console.error("Push error:", e);
      toast.error("Ошибка", {
        description: "Попробуй перезагрузить страницу и снова",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        "w-10 h-6 rounded-full relative transition-colors shrink-0",
        enabled ? "bg-primary" : "bg-muted"
      )}
    >
      <div className={cn(
        "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
        enabled ? "translate-x-4" : "translate-x-0.5"
      )} />
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
