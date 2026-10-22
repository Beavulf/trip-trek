"use client";

import { useEffect, useMemo, useState } from "react";
import { useTrip, useAddJournal, useCurrentTripId } from "@/hooks/use-trip";
import { useFormDraft } from "@/hooks/use-form-draft";
import { draftKey, readDraft, writeDraft } from "@/lib/form-draft";
import { isValidMood } from "@/lib/moods";
import { useTripStore } from "@/lib/trip-store";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DayPicker } from "./DayPicker";
import { DraftNotice } from "./DraftNotice";
import { StickySubmit } from "./StickySubmit";
import { MOODS } from "@/lib/moods";

interface JournalFormProps {
  userId: string;
  onDone: () => void;
}

interface JournalDraft {
  content: string;
  mood: string;
  dayId: string;
}

const isJournalDraftEmpty = (d: JournalDraft): boolean => !d.content.trim();

export function JournalForm({ userId, onDone }: JournalFormProps) {
  const { data: trip } = useTrip();
  const tripId = useCurrentTripId();
  const addJournal = useAddJournal();
  // Заметка пишется долго и стоит дорого: случайный тап по фону шита или свайп приложения
  // её не теряют — текст возвращается при следующем открытии
  const storageKey = draftKey("journal", tripId, userId);
  const [draft] = useState(() => readDraft<JournalDraft>(storageKey));
  const [restored, setRestored] = useState(() => !!draft && !isJournalDraftEmpty(draft));
  const [content, setContent] = useState(draft?.content ?? "");
  const [mood, setMood] = useState<string>(draft?.mood && isValidMood(draft.mood) ? draft.mood : "😊");
  const [dayId, setDayId] = useState(draft?.dayId ?? "");

  useEffect(() => {
    if (!trip?.days?.length) return;
    if (dayId && trip.days.some((d) => d.id === dayId)) return;
    const today =
      trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ??
      trip.days[0]?.id ??
      "";
    setDayId(today);
  }, [trip, dayId]);

  const draftValue = useMemo<JournalDraft>(() => ({ content, mood, dayId }), [content, mood, dayId]);
  const { discard } = useFormDraft(storageKey, draftValue, isJournalDraftEmpty);

  const clearAll = () => {
    discard();
    setContent("");
    setMood("😊");
    setRestored(false);
  };

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Напишите что-нибудь");
      return;
    }
    if (trimmed.length > 5000) {
      toast.error("Слишком длинная запись (макс 5000 символов)");
      return;
    }
    if (!dayId) {
      toast.error("Выберите день");
      return;
    }
    if (!userId) {
      toast.error("Войдите, чтобы добавить запись");
      return;
    }
    const snapshot = draftValue;
    // Оптимистично: запись уже в ленте (useAddJournal), форма очищается и шит закрывается сразу.
    // Не сохранилась — текст возвращается в черновик, а не пропадает
    clearAll();
    onDone();
    addJournal
      .mutateAsync({ dayId, content: trimmed, mood, userId })
      .then(() => toast.success("Запись добавлена в дневник 📔"))
      .catch((err) => {
        writeDraft(storageKey, snapshot);
        toast.error("Запись не сохранилась", {
          description: err instanceof Error ? err.message : "Проверьте связь и попробуйте ещё раз",
          action: { label: "Вернуть", onClick: () => useTripStore.getState().openQuickAdd("journal") },
          duration: 10_000,
        });
      });
  };

  return (
    <div className="space-y-3">
      {restored && <DraftNotice onClear={clearAll} />}
      {/* Текст — главное, настроение и день следом (аудит 2026-10-06) */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Что запомнилось сегодня?"
        rows={4}
        maxLength={5000}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-base input-mobile resize-none"
      />

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Настроение</label>
        <div className="flex gap-1 flex-wrap">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m)}
              aria-label={`Настроение ${m}`}
              aria-pressed={mood === m}
              className={cn(
                "size-11 rounded-lg text-xl grid place-items-center transition-all min-h-11",
                mood === m ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <StickySubmit>
        <button
          type="button"
          onClick={submit}
          disabled={addJournal.isPending || !dayId || !userId}
          className="w-full min-h-[48px] rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-[0.98]"
        >
          {addJournal.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Сохранить запись
        </button>
      </StickySubmit>
    </div>
  );
}
