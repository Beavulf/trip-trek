"use client";

// Центр обучения: все туры списком со статусом («пройдено», «остановились на шаге 3»), запуск и
// продолжение любого, переключатель автоподсказок и «Сбросить всё». Заменяет единственную
// кнопку «Пройти заново», которая сбрасывала сразу всё и не давала посмотреть один раздел.

import { CheckCircle2, Circle, PauseCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/hooks/use-onboarding";
import { TOURS, stepsFor, tourStatusView } from "@/lib/onboarding";
import { TOUR_GROUP_LABELS, type TourGroup } from "@/lib/onboarding-content";
import { cn } from "@/lib/utils";

const GROUP_ORDER: TourGroup[] = ["start", "plan", "memories", "road", "together", "split"];

export function LearningCenter({
  open,
  onOpenChange,
  onWatch,
  onReset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Запустить тур (хозяин туров или страница сами решают, как его показать) */
  onWatch: (id: string) => void;
  /** После «Сбросить всё» (в Профиле — вернуть на главную, где откроется знакомство) */
  onReset?: () => void;
}) {
  const { state, commit, resetAll } = useOnboarding();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const tours = TOURS.filter((t) => stepsFor(t, null).length > 0);
  const finished = tours.filter((t) => {
    const s = state.tours[t.id]?.status;
    return s === "done" || s === "skipped";
  }).length;

  const doReset = async () => {
    setResetting(true);
    const ok = await resetAll();
    setResetting(false);
    setConfirmReset(false);
    if (!ok) {
      toast.error("Не удалось сбросить на сервере", { description: "Сброс сохранён на устройстве и дойдёт при следующем входе" });
    } else {
      toast.success("Обучение сброшено", { description: "Знакомство откроется заново" });
    }
    onOpenChange(false);
    onReset?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-3 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Обучение</DialogTitle>
            <DialogDescription>
              Туры по разделам — смотрите в любом порядке и сколько угодно раз. Пройдено {finished} из {tours.length}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-2">
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Показывать подсказки</div>
                <div className="text-xs text-muted-foreground">
                  Короткий тур при первом заходе в раздел. Кнопка «?» работает всегда.
                </div>
              </div>
              <Switch
                checked={!state.hintsOff}
                onCheckedChange={(on) => void commit({ hintsOff: !on, ...(on ? { snoozedUntil: null } : {}) })}
                aria-label="Показывать подсказки"
              />
            </label>

            {GROUP_ORDER.map((g) => {
              const list = tours.filter((t) => t.group === g);
              if (list.length === 0) return null;
              return (
                <section key={g} aria-label={TOUR_GROUP_LABELS[g]}>
                  <h3 className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {TOUR_GROUP_LABELS[g]}
                  </h3>
                  <ul className="overflow-hidden rounded-2xl border border-border bg-card">
                    {list.map((t) => {
                      const v = tourStatusView(state, t);
                      const Icon = v.tone === "done" ? CheckCircle2 : v.tone === "paused" ? PauseCircle : Circle;
                      return (
                        <li key={t.id} className="flex items-center gap-3 border-b border-border p-3 last:border-b-0">
                          <Icon
                            className={cn(
                              "size-5 shrink-0",
                              v.tone === "done" && "text-emerald-500",
                              v.tone === "paused" && "text-amber-500",
                              v.tone === "new" && "text-muted-foreground/40"
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{t.title}</div>
                            <div className="line-clamp-2 text-xs text-muted-foreground">{t.about}</div>
                            <div className={cn("text-[11px]", v.tone === "paused" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                              {v.label}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onWatch(t.id)}
                            className={cn(
                              "min-h-10 shrink-0 rounded-xl px-3 text-xs font-semibold transition-transform active:scale-95",
                              v.resume
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-secondary hover:bg-accent"
                            )}
                          >
                            {v.resume ? "Продолжить" : "Смотреть"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-4" aria-hidden /> Сбросить всё и пройти заново
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить обучение?</AlertDialogTitle>
            <AlertDialogDescription>
              Все туры станут «не смотрели», вернётся список «Первые шаги», а знакомство откроется заново. Ваши данные
              поездок не затрагиваются.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting}
              onClick={(e) => {
                e.preventDefault();
                void doReset();
              }}
            >
              {resetting ? "Сбрасываем…" : "Сбросить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
