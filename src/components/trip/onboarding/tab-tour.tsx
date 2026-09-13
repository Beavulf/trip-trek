"use client";

// Обучалки вкладок: при первом открытии вкладки (Обзор, Лента, Маршрут, Карта,
// Бюджет, Chill, Фразы) через паузу открывается интерактивная карточка-тур
// с фичами этой вкладки — та же оболочка, что у welcome-тура. Показана один
// раз на устройстве (localStorage), «Пройти заново» в профиле сбрасывает.
// Верхнюю плашку-подсказку заменили именно этим: полноценное обучение вместо строчки.

import { useEffect, useRef, useState } from "react";
import { TAB_TOURS, readSeenTabTours, writeSeenTabTour } from "@/lib/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTripStore } from "@/lib/trip-store";
import { TourDialog, type TourDialogStep } from "./tour-dialog";
import { TabStepArt } from "./illustrations";

/** Пауза перед открытием после смены вкладки: пусть сперва покажется раздел */
const OPEN_DELAY_MS = 800;
/** После welcome-тура не открываем обучалку вкладки сразу — не застакивать туры */
const AFTER_WELCOME_COOLDOWN_MS = 60_000;

export function TabTour() {
  const { userId, status, completed } = useOnboarding();
  const activeTab = useTripStore((s) => s.activeTab);
  // Снимок показанных на момент маунта + ref: отметка «показано» не должна
  // перерисовывать компонент и прятать то, что только что открыли
  const [seenSeed] = useState(() => readSeenTabTours(userId));
  const seenRef = useRef<Set<string>>(new Set(seenSeed ?? []));
  const [openTab, setOpenTab] = useState<string | null>(null);
  const suppressUntil = useRef(0);
  const prevCompleted = useRef(completed);

  // Пока welcome-тур не закрыт (completed на аккаунте), обучалки вкладок молчат —
  // иначе новый пользователь получил бы два тура подряд. А сразу после закрытия
  // welcome держим паузу, чтобы не застакивать второй тур поверх первого экрана.
  useEffect(() => {
    if (completed && !prevCompleted.current) suppressUntil.current = Date.now() + AFTER_WELCOME_COOLDOWN_MS;
    prevCompleted.current = completed;
  }, [completed]);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    if (!completed) return; // сперва — приветственный тур
    if (Date.now() < suppressUntil.current) return;
    if (openTab) return;
    const def = TAB_TOURS.find((t) => t.tab === activeTab);
    if (!def || seenRef.current.has(activeTab)) return;
    const timer = window.setTimeout(() => {
      seenRef.current.add(activeTab);
      writeSeenTabTour(userId, activeTab);
      setOpenTab(activeTab);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeTab, userId, status, completed, openTab]);

  const def = openTab ? TAB_TOURS.find((t) => t.tab === openTab) : null;
  if (!def) return null;

  const steps: TourDialogStep[] = def.steps.map((s) => ({
    id: s.id,
    title: s.title,
    text: s.text,
    art: <TabStepArt icon={s.icon} chips={s.chips} />,
  }));

  return <TourDialog steps={steps} eyebrow={def.eyebrow} onClose={() => setOpenTab(null)} />;
}
