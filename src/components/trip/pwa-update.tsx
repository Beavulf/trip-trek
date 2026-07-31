"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";

// Компонент для уведомления о новом обновлении PWA
// Проверяет обновления SW и показывает toast с кнопкой "Обновить"
export function PWAUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Регистрируем SW (если ещё не зарегистрирован)
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Проверяем обновление сразу
      reg.update().catch(() => {});

      // Слушаем новое обновление SW
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          // Новый SW скачан и ждёт активации
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Есть обновление! Показываем уведомление
            setWaitingWorker(newWorker);
            setShowUpdate(true);
          }
        });
      });
    }).catch(() => {});

    // Слушаем смену контроллера (новый SW активировался)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      // Перезагружаем страницу чтобы загрузить новый код
      window.location.reload();
    });

    // Проверяем обновления каждые 60 секунд
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          reg.update().catch(() => {});
        });
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      // Отправляем сообщение SW чтобы он активировался
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    setShowUpdate(false);
    // Перезагрузка произойдёт автоматически через controllerchange event
  };

  return (
    <AnimatePresence>
      {showUpdate && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed bottom-4 left-4 right-4 z-[300] mx-auto max-w-sm"
        >
          <div className="bg-card border border-primary/30 rounded-2xl shadow-2xl p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
              <RefreshCw className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Доступна новая версия</div>
              <div className="text-xs text-muted-foreground">Обновите приложение для новых функций</div>
            </div>
            <button
              onClick={handleUpdate}
              className="shrink-0 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:opacity-90"
            >
              Обновить
            </button>
            <button
              onClick={() => setShowUpdate(false)}
              className="shrink-0 size-7 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
