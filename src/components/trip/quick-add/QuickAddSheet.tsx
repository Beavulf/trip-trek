"use client";

import { useEffect, useState } from "react";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { BookOpen, Camera, Plus as PlusIcon, Wallet } from "lucide-react";
import { useAuth as useSession } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { PhotoForm } from "./PhotoForm";
import { ExpenseForm } from "./ExpenseForm";
import { JournalForm } from "./JournalForm";
import { useTripStore } from "@/lib/trip-store";

type Mode = "photo" | "expense" | "journal";

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("photo");
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const { data: session } = useSession();
  const { setTripSwitcherOpen } = useTripStore();
  const userId = (session?.user as { id?: string } | undefined)?.id || "";

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
          {trip && (
            <p className="text-xs text-muted-foreground -mt-1 mb-3">
              День {trip.currentDayNumber} ·{" "}
              {trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.city ?? ""}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                { key: "photo", label: "Фото", icon: Camera, color: "#06b6d4" },
                { key: "expense", label: "Трата", icon: Wallet, color: "#10b981" },
                { key: "journal", label: "Заметка", icon: BookOpen, color: "#8b5cf6" },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all overflow-hidden active:scale-95 min-h-11",
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/10"
                      : "border-border text-muted-foreground hover:bg-accent hover:border-primary/20"
                  )}
                >
                  <div
                    className="relative size-10 rounded-xl grid place-items-center"
                    style={{ background: active ? `${m.color}22` : "transparent" }}
                  >
                    <Icon className="size-6" strokeWidth={2} style={{ color: active ? m.color : undefined }} />
                  </div>
                  <span className="relative text-sm font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
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
