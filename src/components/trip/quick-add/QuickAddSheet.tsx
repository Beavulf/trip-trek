"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { BookOpen, Camera, Plus as PlusIcon, Wallet } from "lucide-react";
import { useAuth as useSession } from "@/hooks/use-auth";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { ExpenseForm } from "./ExpenseForm";
import { JournalForm } from "./JournalForm";
import { useTripStore } from "@/lib/trip-store";

// exifr (~100 KB) живёт в PhotoForm — в первичный бандл не тянем (аудит 2026-09-13);
// чанк дополнительно прогревается на касании FAB (app-shell, аудит 2026-10-06)
const PhotoForm = dynamic(() => import("./PhotoForm").then((m) => m.PhotoForm), { ssr: false });

type Mode = "photo" | "expense" | "journal";

const MODES = [
  { key: "photo", label: "Фото", icon: Camera, color: "#06b6d4" },
  { key: "expense", label: "Трата", icon: Wallet, color: "#10b981" },
  { key: "journal", label: "Заметка", icon: BookOpen, color: "#8b5cf6" },
] as const;

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("photo");
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const { data: session } = useSession();
  const { setTripSwitcherOpen } = useTripStore();
  const userId = (session?.user as { id?: string } | undefined)?.id || "";
  // Диалог-семантика + Esc + фокус-трап: раньше шит был «безымянным» div-ом
  // без роли, скринридеры не воспринимали его как модалку (аудит 2026-10-06)
  const panelRef = useDialogA11y<HTMLDivElement>(open, () => onOpenChange(false));

  useEffect(() => {
    if (!open) setMode("photo");
  }, [open]);

  const noTrip = !tripId;
  const noDays = !!trip && (!trip.days || trip.days.length === 0);

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Быстрое добавление"
      titleIcon={<PlusIcon className="size-4" />}
      panelRef={panelRef}
      role="dialog"
      ariaLabel="Быстрое добавление"
    >
      {noTrip ? (
        <div className="py-6 text-center space-y-3">
          <div className="text-4xl">🧭</div>
          <p className="text-sm font-medium">Нет активной поездки</p>
          <p className="text-xs text-muted-foreground">Сначала создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              setTripSwitcherOpen(true);
            }}
            className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Мои поездки →
          </button>
        </div>
      ) : noDays ? (
        <div className="py-6 text-center space-y-3">
          <div className="text-4xl">📅</div>
          <p className="text-sm font-medium">Нет дней в маршруте</p>
          <p className="text-xs text-muted-foreground">Добавь день, чтобы привязать фото, трату или заметку</p>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              useTripStore.getState().setActiveTab("itinerary");
            }}
            className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            К маршруту →
          </button>
        </div>
      ) : (
        <>
          {/* Компактный сегмент вместо крупных карточек: фото-флоу начинается
              выше, режимы читаются по иконкам (паттерн как в теме MobileMoreSheet) */}
          <div role="tablist" aria-label="Тип записи" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 min-h-10 px-1 rounded-xl text-sm font-medium transition-colors",
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" style={active ? { color: m.color } : undefined} />
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            {!userId ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Войдите, чтобы добавлять
              </div>
            ) : (
              <>
                {mode === "photo" && <PhotoForm onDone={() => onOpenChange(false)} />}
                {mode === "expense" && <ExpenseForm userId={userId} onDone={() => onOpenChange(false)} />}
                {mode === "journal" && <JournalForm userId={userId} onDone={() => onOpenChange(false)} />}
              </>
            )}
          </div>
        </>
      )}
    </MobileBottomSheet>
  );
}
