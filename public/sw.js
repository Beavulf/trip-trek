// Service Worker для TripTrek — push-уведомления + кэширование
const CACHE_NAME = "triptrek-v1";
const STATIC_ASSETS = ["/", "/login", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

// Установка — кэшируем базовые страницы
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// Активация
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Push-уведомления
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { message: event.data?.text() || "Новое уведомление" };
  }

  const title = data.title || "TripTrek";
  const options = {
    body: data.message || "Новое событие в поездке",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "triptrek",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Клик по уведомлению — открыть приложение
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Если уже открыто — фокусируем
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Иначе открываем новую
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Fetch — кэширование для offline (опционально)
self.addEventListener("fetch", (event) => {
  // Только GET
  if (event.request.method !== "GET") return;
  // Пропускаем API запросы (нужны свежие данные)
  if (event.request.url.includes("/api/")) return;
  // Пропускаем WebSocket
  if (event.request.url.includes("/socket.io/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            // Кэшируем успешные ответы
            if (response.status === 200 && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback
            if (event.request.mode === "navigate") {
              return caches.match("/");
            }
          })
      );
    })
  );
});
