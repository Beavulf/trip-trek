"use client";

// Контекстные подсказки вкладок: при первом открытии Маршрута/Карты/Бюджета/Чата
// под шапкой всплывает одна короткая строка. Отметка «показано» живёт в localStorage
// на устройстве (повтор на новом устройстве не страшен — подсказка крохотная).
// Видимость выводится при рендере, эффекты только пишут во внешнее хранилище —
// никаких setState внутри эффектов (иначе мгновенно прятали бы то, что показали).

import { motion, useReducedMotion } from "framer-motion";
import { ListChecks, Map as MapIcon, MessagesSquare, Wallet, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TAB_HINTS, writeSeenHint, type TourHint } from "@/lib/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTripStore } from "@/lib/trip-store";

const HINT_ICONS: Record<string, LucideIcon> = {
  itinerary: ListChecks,
  map: MapIcon,
  budget: Wallet,
  board: MessagesSquare,
};

export function TabHints() {
  const { userId, seenHints } = useOnboarding();
  const activeTab = useTripStore((s) => s.activeTab);
  const reduced = useReducedMotion();
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Дедупликация записи в localStorage, чтобы эффект не писал на каждом рендере
  const markedRef = useRef<Set<string>>(new Set());

  const hint = userId && seenHints ? (TAB_HINTS.find((h) => h.tab === activeTab) ?? null) : null;
  const visible: TourHint | null =
    hint && seenHints && !seenHints.includes(hint.id) && dismissed !== hint.id ? hint : null;
  const visibleId = visible?.id ?? null;

  // Отметка «показано» — запись только во внешнюю систему: подсказка остаётся на
  // экране до закрытия/ухода со вкладки, но при следующем монтировании не вернётся
  useEffect(() => {
    if (!visibleId || !userId || markedRef.current.has(visibleId)) return;
    markedRef.current.add(visibleId);
    writeSeenHint(userId, visibleId);
  }, [visibleId, userId]);

  const Icon = visible ? HINT_ICONS[visible.id] : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3 sm:px-4">
      {/* Без AnimatePresence (паттерн MobileMoreSheet): условный маунт — вход
          анимируется, скрытие мгновенное и гарантированное, без зависших плашки */}
      {visible && Icon && (
        <motion.div
          key={visible.id}
          role="status"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 py-2.5 pl-3 pr-2 shadow-xl backdrop-blur"
        >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold">{visible.title}</p>
              <p className="text-xs leading-snug text-muted-foreground">{visible.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(visible.id)}
              aria-label="Скрыть подсказку"
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
        </motion.div>
      )}
    </div>
  );
}
