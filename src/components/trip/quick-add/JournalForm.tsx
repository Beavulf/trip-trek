"use client";

import { useEffect, useState } from "react";
import { useTrip, useAddJournal } from "@/hooks/use-trip";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DayPicker } from "./DayPicker";
import { MOODS } from "@/lib/moods";

interface JournalFormProps {
  userId: string;
  onDone: () => void;
}

export function JournalForm({ userId, onDone }: JournalFormProps) {
  const { data: trip } = useTrip();
  const addJournal = useAddJournal();
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>("😊");
  const [dayId, setDayId] = useState("");

  useEffect(() => {
    if (!trip?.days?.length) return;
    if (dayId && trip.days.some((d) => d.id === dayId)) return;
    const today =
      trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ??
      trip.days[0]?.id ??
      "";
    setDayId(today);
  }, [trip, dayId]);

  const submit = async () => {
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
    try {
      await addJournal.mutateAsync({
        dayId,
        content: trimmed,
        mood,
        userId,
      });
      toast.success("Запись добавлена в дневник 📔");
      setContent("");
      setMood("😊");
      onDone();
    } catch (err) {
      toast.error("Не удалось добавить запись", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

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

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Что запомнилось сегодня?"
        rows={4}
        maxLength={5000}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base input-mobile resize-none"
      />

      <button
        type="button"
        onClick={submit}
        disabled={addJournal.isPending || !dayId || !userId}
        className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {addJournal.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Сохранить запись
      </button>
    </div>
  );
}
