"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { BookOpen, Camera, Plus as PlusIcon, Wallet } from "lucide-react";
import { useAuth as useSession } from "@/hooks/use-auth";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { useStagedCount } from "@/hooks/use-upload-queue";
import { draftKey, hasDraft } from "@/lib/form-draft";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { ExpenseForm } from "./ExpenseForm";
import { JournalForm } from "./JournalForm";
import { useTripStore, type QuickAddMode } from "@/lib/trip-store";

// exifr (~100 KB) живёт в PhotoForm — в первичный бандл не тянем (аудит 2026-09-13);
// чанк дополнительно прогревается на касании FAB (app-shell, аудит 2026-10-06)
const PhotoForm = dynamic(() => import("./PhotoForm").then((m) => m.PhotoForm), { ssr: false });

const MODES = [
  { key: "photo", label: "Фото", icon: Camera, color: "#06b6d4" },
  { key: "expense", label: "Трата", icon: Wallet, color: "#10b981" },
  { key: "journal", label: "Заметка", icon: BookOpen, color: "#8b5cf6" },
] as const;

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // Закрытие шита (назад/свайп/Esc/фон) больше ничего не рвёт: загрузка фото живёт в фоновой
  // очереди, а наборы трат и заметок сохраняются черновиком — подтверждения не нужны
  const close = () => onOpenChange(false);
  // Диалог-семантика + Esc + фокус-трап: раньше шит был «безымянным» div-ом
  // без роли, скринридеры не воспринимали его как модалку (аудит 2026-10-06)
  const panelRef = useDialogA11y<HTMLDivElement>(open, close);

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
      {/* Содержимое монтируется на каждое открытие: режим и формы стартуют чистыми,
          а не сбрасываются эффектом после закрытия */}
      <QuickAddBody onClose={close} />
    </MobileBottomSheet>
  );
}

function QuickAddBody({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<QuickAddMode>(() => useTripStore.getState().quickAddMode ?? "photo");
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const { data: session } = useSession();
  const setTripSwitcherOpen = useTripStore((s) => s.setTripSwitcherOpen);
  const userId = (session?.user as { id?: string } | undefined)?.id || "";
  const staged = useStagedCount(tripId);

  // Точка на вкладке — там лежит неотправленный черновик (трата, заметка или выбранные фото)
  const hasDrafts = useMemo(
    () => ({
      photo: staged > 0,
      expense: !!(tripId && userId) && hasDraft(draftKey("expense", tripId, userId)),
      journal: !!(tripId && userId) && hasDraft(draftKey("journal", tripId, userId)),
    }),
    // mode в зависимостях: уходя с вкладки, форма сохраняет черновик — перечитываем
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staged, tripId, userId, mode]
  );

  const noTrip = !tripId;
  const noDays = !!trip && (!trip.days || trip.days.length === 0);

  if (noTrip) {
    return (
      <div className="py-6 text-center space-y-3">
        <div className="text-4xl">🧭</div>
        <p className="text-sm font-medium">Нет активной поездки</p>
        <p className="text-xs text-muted-foreground">Сначала создай или выбери поездку</p>
        <button
          type="button"
          onClick={() => {
            onClose();
            setTripSwitcherOpen(true);
          }}
          className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Мои поездки →
        </button>
      </div>
    );
  }

  if (noDays) {
    return (
      <div className="py-6 text-center space-y-3">
        <div className="text-4xl">📅</div>
        <p className="text-sm font-medium">Нет дней в маршруте</p>
        <p className="text-xs text-muted-foreground">Добавь день, чтобы привязать фото, трату или заметку</p>
        <button
          type="button"
          onClick={() => {
            onClose();
            useTripStore.getState().setActiveTab("itinerary");
          }}
          className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          К маршруту →
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Компактный сегмент вместо крупных карточек: фото-флоу начинается
          выше, режимы читаются по иконкам (паттерн как в теме MobileMoreSheet) */}
      <div role="tablist" aria-label="Тип записи" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          const draft = !active && hasDrafts[m.key];
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={draft ? `${m.label}, есть черновик` : m.label}
              onClick={() => setMode(m.key)}
              className={cn(
                "relative flex items-center justify-center gap-1.5 min-h-10 px-1 rounded-xl text-sm font-medium transition-colors",
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" style={active ? { color: m.color } : undefined} />
              {m.label}
              {draft && (
                <span
                  className="absolute top-1.5 right-2 size-1.5 rounded-full"
                  style={{ background: m.color }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {!userId ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Войдите, чтобы добавлять</div>
        ) : (
          <>
            {mode === "photo" && <PhotoForm onDone={onClose} />}
            {mode === "expense" && <ExpenseForm userId={userId} onDone={onClose} />}
            {mode === "journal" && <JournalForm userId={userId} onDone={onClose} />}
          </>
        )}
      </div>
    </>
  );
}
