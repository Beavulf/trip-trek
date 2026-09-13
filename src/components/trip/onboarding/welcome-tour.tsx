"use client";

// Приветственный тур: лёгкая карусель из 5 шагов поверх приложения.
// Открывается сам, если на аккаунте нет onboardingCompletedAt; закрывается
// любой кнопкой/Esc/кликом по фону — отметка «пройдено» летит на аккаунт,
// чтобы тур не преследовал пользователя на других устройствах.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOUR_STEPS } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/hooks/use-onboarding";
import { TourArt } from "./illustrations";

export function WelcomeTour() {
  const { status, completed, localDone, setOnboardingCompleted } = useOnboarding();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const reduced = useReducedMotion();
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const retriedRef = useRef(false);

  const finish = useCallback(() => {
    setOpen(false);
    void setOnboardingCompleted(true);
  }, [setOnboardingCompleted]);

  // localDone приходит из ленивой инициализации (реальное значение localStorage),
  // так что ни заглушки, ни ложного «уже пройдено» на первом рендере нет
  const eligible = status === "authenticated" && !completed && !localDone;
  // Видимость выводится (а не синхронизируется эффектом): достаточно, чтобы
  // исчезла при завершении на другом устройстве — оверлей уйдёт анимацией выхода
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

  // Esc = «Пропустить»: обучение никогда не держит пользователя силой
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  // Фон не скроллится под туром; фокус сразу в основную кнопку
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.requestAnimationFrame(() => primaryBtnRef.current?.focus());
    return () => {
      document.body.style.overflow = prev;
      window.cancelAnimationFrame(id);
    };
  }, [open]);

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };
  const primary = () => (step === TOUR_STEPS.length - 1 ? finish() : go(step + 1));

  // Лёгкая ловушка фокуса: Tab не выпускает в приложение под оверлеем
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !cardRef.current) return;
    const items = cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined" || !visible) return null;

  // Без внешнего AnimatePresence: паттерн приложения (MobileMoreSheet) — условный
  // маунт оверлея. Exit-анимация здесь полагалась бы на размонт AnimatePresence,
  // который может запоздать и оставить невидимый оверлей, блокирующий клики.
  // Вход анимируется, закрытие — мгновенное и гарантированное.
  return createPortal(
    <motion.div
      key="tour-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      onClick={finish}
      className="fixed inset-0 z-[300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Знакомство с TripTrek"
        onKeyDown={trapTab}
        onClick={(e) => e.stopPropagation()}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:max-w-md"
      >
            {/* Иллюстрация шага: слайд по направлению навигации */}
            <div className="px-5 pt-5">
              <div className="relative h-36 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 sm:h-40">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={TOUR_STEPS[step].id}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, x: 48 * dir }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, x: -48 * dir }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="grid place-items-center"
                  >
                    <TourArt art={TOUR_STEPS[step].art} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Текст шага */}
            <div className="px-5 pt-4 sm:px-6">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={TOUR_STEPS[step].id}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 * dir }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 * dir }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="text-center"
                >
                  <h2 className="text-lg font-bold tracking-tight">{TOUR_STEPS[step].title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{TOUR_STEPS[step].text}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Управление: пропустить · точки · назад/далее */}
            <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-4 sm:px-6">
              <button
                type="button"
                onClick={finish}
                className="min-h-11 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                Пропустить
              </button>

              <div className="flex items-center" aria-label="Шаги обучения">
                {TOUR_STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={i === step ? "step" : undefined}
                    aria-label={`Шаг ${i + 1} из ${TOUR_STEPS.length}`}
                    onClick={() => go(i)}
                    className="p-1.5"
                  >
                    <span
                      className={cn(
                        "block h-2 rounded-full transition-all duration-300",
                        i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      )}
                    />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => go(step - 1)}
                    aria-label="Назад"
                    className="grid size-11 place-items-center rounded-xl border border-border bg-secondary text-sm font-medium transition-colors hover:bg-accent active:scale-95"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                )}
                <button
                  ref={primaryBtnRef}
                  type="button"
                  onClick={primary}
                  className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-transform active:scale-[0.97]"
                >
                  {TOUR_STEPS[step].cta ?? "Далее"}
                </button>
              </div>
            </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
