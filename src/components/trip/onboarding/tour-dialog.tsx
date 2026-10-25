"use client";

// TourDialog — оболочка обучения (приветствие, туры вкладок, «Сочтёмся», «Что нового»):
// карточка с анимированным макетом шага, текстом, прогрессом и кнопками. Паттерн приложения
// (MobileMoreSheet): условный маунт без внешнего AnimatePresence — вход анимирован, закрытие
// мгновенное, без невидимых подложек, блокирующих клики.
//
// Выход никогда не случайный: «Пропустить», тап по фону, Esc и «назад» на телефоне открывают
// панель «Закрыть обучение?» с выбором — продолжить / напомнить позже / пропустить тур /
// больше не показывать подсказки. Так лишний тап не стоит человеку всего обучения.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import type { TourDef, TourStepDef } from "@/lib/onboarding-content";
import type { TourExit } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { StepArt } from "./illustrations";

function eyebrowFor(def: TourDef): string {
  if (def.kind === "welcome") return "Знакомство";
  if (def.kind === "whatsnew") return "Что нового";
  return `Обучение · ${def.title}`;
}

export function TourDialog({
  def,
  steps,
  startStep,
  onExit,
}: {
  def: TourDef;
  /** Шаги уже отфильтрованы по роли */
  steps: TourStepDef[];
  startStep: number;
  onExit: (exit: TourExit) => void;
}) {
  const [step, setStep] = useState(() => Math.min(Math.max(0, startStep), Math.max(0, steps.length - 1)));
  const [dir, setDir] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const reduced = useReducedMotion();
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const continueBtnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const last = step === steps.length - 1;
  const current = steps[Math.min(step, steps.length - 1)];

  // «назад» на телефоне: первый раз спрашивает «Закрыть?», второй (в панели) — возвращает в тур
  useBackDismiss(!confirming, () => setConfirming(true));
  useBackDismiss(confirming, () => setConfirming(false));

  // Esc: то же, что «назад»
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Фон не скроллится под туром
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Фокус: в основную кнопку; при смене панели — в её первую кнопку
  useEffect(() => {
    const id = window.requestAnimationFrame(() => (confirming ? continueBtnRef : primaryBtnRef).current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [confirming]);

  const go = useCallback(
    (next: number) => {
      setDir(next > step ? 1 : -1);
      setStep(next);
    },
    [step]
  );

  const primary = () => (last ? onExit({ kind: "done" }) : go(step + 1));
  // «Попробовать»: тур закрывается на следующем шаге (его можно продолжить), действие исполняет хозяин туров
  const act = () => {
    if (!current.action) return;
    if (last) onExit({ kind: "done", action: current.action.do });
    else onExit({ kind: "action", step: step + 1, action: current.action.do });
  };

  // Лёгкая ловушка фокуса: Tab не выпускает в приложение под оверлеем
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !cardRef.current) return;
    const items = cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (items.length === 0) return;
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined" || steps.length === 0) return null;

  return createPortal(
    <motion.div
      key="tour-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      onClick={() => setConfirming(true)}
      className="fixed inset-0 z-[300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={eyebrowFor(def)}
        onKeyDown={trapTab}
        onClick={(e) => e.stopPropagation()}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:max-w-md"
      >
        {/* Макет шага: слайд по направлению навигации. Верхняя полоса арта — «шаг N из M» и «Пропустить»:
            в ряду кнопок внизу последняя не помещалась на телефонах и выдавливала «Далее» за край карточки,
            а поверх макета перекрывала его шапку */}
        <div className="px-5 pt-5">
          <div className="relative flex h-52 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10">
            <div className="z-10 flex h-11 shrink-0 items-center justify-between px-2.5">
              {steps.length > 1 ? (
                <span className="rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground backdrop-blur-sm">
                  {step + 1} из {steps.length}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="min-h-9 rounded-full border border-border bg-card/90 px-3 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground active:scale-95"
              >
                Пропустить
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={current.id}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, x: 48 * dir }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: -48 * dir }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="absolute inset-0"
                >
                  <StepArt step={current} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {confirming ? (
          <ExitPanel
            step={step}
            total={steps.length}
            continueRef={continueBtnRef}
            onContinue={() => setConfirming(false)}
            onLater={() => onExit({ kind: "later", step })}
            onSkip={() => onExit({ kind: "skip", step })}
            onOff={() => onExit({ kind: "hints-off", step })}
          />
        ) : (
          <>
            <div className="px-5 pt-4 sm:px-6" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={current.id}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 * dir }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 * dir }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="text-center"
                >
                  <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/80">
                    <span>{eyebrowFor(def)}</span>
                  </div>
                  <h2 className="mt-1 text-base font-bold tracking-tight">{current.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{current.text}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {current.action && (
              <div className="px-5 pt-3 sm:px-6">
                <button
                  type="button"
                  onClick={act}
                  className="min-h-11 w-full rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 active:scale-[0.98]"
                >
                  Попробовать: {current.action.label}
                </button>
              </div>
            )}

            {/* Управление: назад · точки · далее. Ряд обязан влезать в 360px, поэтому
                точки сжимаются (min-w-0), а кнопки не переносят текст */}
            <div className="flex items-center gap-2 px-5 pb-5 pt-4 sm:px-6">
              {/* Плейсхолдер ширины «Назад» — точки стоят по центру и на первом шаге */}
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  aria-label="Назад"
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-sm font-medium transition-colors hover:bg-accent active:scale-95"
                >
                  <ChevronLeft className="size-4" />
                </button>
              ) : (
                <span aria-hidden className="size-11 shrink-0" />
              )}

              <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden" aria-label="Шаги обучения">
                {steps.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={i === step ? "step" : undefined}
                    aria-label={`Шаг ${i + 1} из ${steps.length}`}
                    onClick={() => go(i)}
                    // зона касания 24×32 при видимой точке 8 px
                    className="grid h-8 min-w-6 place-items-center"
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

              <button
                ref={primaryBtnRef}
                type="button"
                onClick={primary}
                className="min-h-11 shrink-0 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-transform active:scale-[0.97]"
              >
                {current.cta ?? (last ? "Готово" : "Далее")}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}

function ExitPanel({
  step,
  total,
  continueRef,
  onContinue,
  onLater,
  onSkip,
  onOff,
}: {
  step: number;
  total: number;
  continueRef: React.RefObject<HTMLButtonElement | null>;
  onContinue: () => void;
  onLater: () => void;
  onSkip: () => void;
  onOff: () => void;
}) {
  const quiet =
    "min-h-11 w-full rounded-xl border border-border bg-secondary px-4 text-left text-sm font-medium transition-colors hover:bg-accent active:scale-[0.98]";
  return (
    <div className="px-5 pb-5 pt-4 sm:px-6">
      <div className="text-center">
        <h2 className="text-base font-bold tracking-tight">Закрыть обучение?</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {total > 1 ? `Вы на шаге ${step + 1} из ${total}. ` : ""}
          Открыть его снова можно в любой момент: кнопка «?» в шапке (на телефоне — меню «Ещё») или Профиль → Обучение.
        </p>
      </div>
      <div className="mt-3 space-y-2">
        <button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-transform active:scale-[0.98]"
        >
          Продолжить
        </button>
        <button type="button" onClick={onLater} className={quiet}>
          Напомнить позже
          <span className="block text-[11px] font-normal text-muted-foreground">Предложу завтра и продолжу с этого шага</span>
        </button>
        <button type="button" onClick={onSkip} className={quiet}>
          Пропустить этот тур
          <span className="block text-[11px] font-normal text-muted-foreground">Остальные подсказки останутся</span>
        </button>
        <button type="button" onClick={onOff} className={quiet}>
          Больше не показывать подсказки
          <span className="block text-[11px] font-normal text-muted-foreground">Включить обратно — Профиль → Обучение</span>
        </button>
      </div>
    </div>
  );
}
