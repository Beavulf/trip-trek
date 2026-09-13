"use client";

// TourDialog — общая оболочка обучения (welcome-тур и обучалки вкладок):
// карточка с иллюстрацией шага, текстом, точками прогресса и кнопками.
// Паттерн приложения (MobileMoreSheet): условный маунт без внешнего
// AnimatePresence — вход анимирован, закрытие мгновенное и гарантированное,
// без невидимых подложек, блокирующих клики. Esc/клик по фону = onClose.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface TourDialogStep {
  id: string;
  title: string;
  text: string;
  art: ReactNode;
  /** Своя надпись основной кнопки (по умолчанию «Далее») */
  cta?: string;
}

export function TourDialog({
  steps,
  onClose,
  eyebrow,
}: {
  /** Диалог маунтится только на время показа — состояние шагов всегда свежее */
  steps: TourDialogStep[];
  onClose: () => void;
  /** Подзаголовок карточки, напр. имя вкладки («Маршрут») */
  eyebrow?: string;
}) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const reduced = useReducedMotion();
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Esc = «Пропустить»: обучение никогда не держит пользователя силой
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Фон не скроллится под туром; фокус сразу в основную кнопку
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.requestAnimationFrame(() => primaryBtnRef.current?.focus());
    return () => {
      document.body.style.overflow = prev;
      window.cancelAnimationFrame(id);
    };
  }, []);

  const go = useCallback(
    (next: number) => {
      setDir(next > step ? 1 : -1);
      setStep(next);
    },
    [step]
  );
  const primary = () => (step === steps.length - 1 ? onClose() : go(step + 1));

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

  if (typeof document === "undefined" || steps.length === 0) return null;
  const current = steps[Math.min(step, steps.length - 1)];

  return createPortal(
    <motion.div
      key="tour-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={eyebrow ? `Обучение: ${eyebrow}` : "Обучение TripTrek"}
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
                key={current.id}
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: 48 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: -48 * dir }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="grid place-items-center"
              >
                {current.art}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Текст шага */}
        <div className="px-5 pt-4 sm:px-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 * dir }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="text-center"
            >
              {eyebrow && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
                  Обучение · {eyebrow}
                </div>
              )}
              <h2 className={cn("font-bold tracking-tight", eyebrow ? "mt-1 text-base" : "text-lg")}>
                {current.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{current.text}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Управление: пропустить · точки · назад/далее */}
        <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            Пропустить
          </button>

          <div className="flex items-center" aria-label="Шаги обучения">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-current={i === step ? "step" : undefined}
                aria-label={`Шаг ${i + 1} из ${steps.length}`}
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
              {current.cta ?? "Далее"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
