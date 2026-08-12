// Service Worker для TripTrek — push + умное кэширование + авто-обновление
// Версия кэша — МЕНЯТЬ ПРИ КАЖДОМ ДЕПЛОЕ!
const CACHE_VERSION = "v26-08-12-uploads";
const CACHE_NAME = `triptrek-${CACHE_VERSION}`;
const STATIC_ASSETS = ["/", "/login", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-1024.png"];

// Установка — кэшируем базовые страницы + skipWaiting для мгновенного обновления
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  // skipWaiting — новый SW активируется сразу (не ждём закрытия всех вкладок)
  self.skipWaiting();
});

// Активация — удаляем СТАРЫЕ версии кэша + claim всех клиентов
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME) // удаляем все кроме текущего
          .map((k) => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      )
    )
  );
  // claim — перехватываем все вкладки сразу
  self.clients.claim();
});

// Обработка сообщения от клиента
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Push-уведомления (Web Push с VAPID)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || "Новое уведомление" };
  }

  const title = data.title || "TripTrek";
  const options = {
    body: data.body || data.message || "Новое событие в поездке",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "triptrek",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Клик по уведомлению
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Fetch — умная стратегия кэширования
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Только GET
  if (request.method !== "GET") return;

  // НИКОГДА не кэшируем:
  // - API запросы (нужны свежие данные)
  // - WebSocket
  // - /socket.io/
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/socket.io/")) {
    return; // Пропускаем — идёт напрямую в сеть
  }

  // Uploads — всегда сеть (runtime files; кэш ломал 404 → «Не удалось показать фото»)
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((c) => c || Response.error()))
    );
    return;
  }

  // Для навигационных запросов (страницы) — NETWORK FIRST с fallback на кэш
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Кэшируем свежую версию страницы
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Оффлайн — отдаём кэш
          return caches.match(request).then((cached) => cached || caches.match("/"));
        })
    );
    return;
  }

  // Для статики (JS, CSS, изображения) — STALE WHILE REVALIDATE
  // Показываем кэш сразу, в фоне обновляем
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          // Кэшируем только успешные ответы
          if (response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached); // Если сеть упала — отдаём кэш

      // Возвращаем кэш сразу (если есть), иначе ждём сеть
      return cached || fetchPromise;
    })
  );
});
