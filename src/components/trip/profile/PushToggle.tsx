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
      if (Notification.permission !== "granted") {
        setEnabled(false);
        return;
      }
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
    if (!userId) {
      toast.error("Войдите чтобы включить уведомления");
      return;
    }

    setLoading(true);
    try {
      if (enabled) {
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
        await fetch(`/api/push/subscribe?all=1`, { method: "DELETE" }).catch(() => {});
        setEnabled(false);
        toast.success("Уведомления отключены");
      } else {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast.error("Разрешение не дано", {
            description: "Разреши уведомления в настройках браузера",
          });
          return;
        }

        const vapidRes = await fetch("/api/push/vapid-public-key");
        const { publicKey } = await vapidRes.json();
        if (!publicKey) {
          toast.error("Push не настроен на сервере");
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });

        const r = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
          }),
        });
        if (!r.ok) throw new Error("subscribe failed");

        setEnabled(true);
        toast.success("Уведомления включены 🔔", {
          description: "Будешь получать push даже при закрытом приложении",
        });
      }
    } catch (e) {
      console.error("Push error:", e);
      toast.error("Не удалось изменить уведомления", {
        description: "Попробуй ещё раз",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      aria-label={enabled ? "Отключить уведомления" : "Включить уведомления"}
      aria-pressed={enabled}
      className={cn(
        "min-h-11 min-w-11 px-1 rounded-full relative transition-colors shrink-0 flex items-center",
        enabled ? "bg-primary" : "bg-muted"
      )}
    >
      <div
        className={cn(
          "size-5 rounded-full bg-white shadow transition-transform mx-0.5",
          enabled ? "translate-x-5" : "translate-x-0"
        )}
      />
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
