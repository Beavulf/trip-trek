"use client";

import { useEffect, useState } from "react";

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

/** User-scoped VAPID push (same path as profile PushToggle). */
export function usePushNotifications(_tripId?: string) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  });

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        setSubscribed(false);
      }
    })();
  }, [supported]);

  const subscribe = async () => {
    if (loading) return { success: false, error: "busy" };
    if (!supported) return { success: false, error: "Not supported" };
    setLoading(true);
    try {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        return { success: false, error: "Permission denied" };
      }

      const vapidRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await vapidRes.json().catch(() => ({}));
      if (!publicKey) {
        return { success: false, error: "Push не настроен на сервере" };
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!r.ok) throw new Error("subscribe failed");

      setSubscribed(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (loading) return { success: false };
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      await fetch(`/api/push/subscribe?all=1`, { method: "DELETE" }).catch(() => {});
      setSubscribed(false);
      return { success: true };
    } catch {
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return {
    permission,
    subscribed,
    loading,
    supported,
    subscribe,
    unsubscribe,
  };
}
