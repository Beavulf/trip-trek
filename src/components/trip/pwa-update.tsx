"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";

// Компонент для уведомления о новом обновлении PWA
// Показывает toast "Доступна новая версия" с кнопкой "Обновить"
export function PWAUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Проверяем обновления каждые 30 секунд
    const checkUpdate = () => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          reg.update().then(() => {
            if (reg.waiting) {
              setWaitingWorker(reg.waiting);
              setShowUpdate(true);
            }
          }).catch(() => {});
        });
      });
    };

    // Сразу при загрузке
    checkUpdate();
    // И каждые 30 секунд
    const interval = setInterval(checkUpdate, 30000);

    // Слушаем нового SW
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Перезагружаем страницу когда новый SW взял контроль
      window.location.reload();
    });

    return () => clearInterval(interval);
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      // Отправляем сообщение SW чтобы он активировался
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    setShowUpdate(false);
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
