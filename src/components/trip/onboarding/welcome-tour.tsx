"use client";

// Приветственный тур: лёгкая карусель из 5 шагов поверх приложения.
// Открывается сам, если на аккаунте нет onboardingCompletedAt; закрывается
// любой кнопкой/Esc/кликом по фону — отметка «пройдено» летит на аккаунт,
// чтобы тур не преследовал пользователя на других устройствах.
// Вся оболочка карточки — в tour-dialog.tsx (общая с обучалками вкладок).

import { useCallback, useEffect, useRef, useState } from "react";
import { TOUR_STEPS } from "@/lib/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";
import { TourDialog, type TourDialogStep } from "./tour-dialog";
import { TourArt } from "./illustrations";

const WELCOME_STEPS: TourDialogStep[] = TOUR_STEPS.map((s) => ({
  id: s.id,
  title: s.title,
  text: s.text,
  cta: s.cta,
  art: <TourArt art={s.art} />,
}));

export function WelcomeTour() {
  const { status, completed, localDone, setOnboardingCompleted } = useOnboarding();
  const [open, setOpen] = useState(false);
  const retriedRef = useRef(false);

  const finish = useCallback(() => {
    setOpen(false);
    void setOnboardingCompleted(true);
  }, [setOnboardingCompleted]);

  // localDone приходит из ленивой инициализации (реальное значение localStorage),
  // так что ни заглушки, ни ложного «уже пройдено» на первом рендере нет
  const eligible = status === "authenticated" && !completed && !localDone;
  // Видимость выводится (а не синхронизируется эффектом): достаточно, чтобы
  // исчезла при завершении на другом устройстве — оверлей уйдёт мгновенно
  const visible = open && eligible;

  // Пауза перед открытием: сперва приложение должно показаться, тур мягко накрывает его
  useEffect(() => {
    if (!eligible) return;
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [eligible]);

  // Страховка: на этом устройстве закрыто, а на аккаунте отметки нет — прошлый
  // PATCH потерялся (офлайн). Повторяем один раз за маунт, без циклов.
  useEffect(() => {
    if (retriedRef.current || status !== "authenticated" || !localDone || completed) return;
    retriedRef.current = true;
    void setOnboardingCompleted(true);
  }, [status, localDone, completed, setOnboardingCompleted]);

  return visible ? <TourDialog steps={WELCOME_STEPS} onClose={finish} /> : null;
}
