"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useUpdateTripDates } from "@/hooks/use-trip";

export function DatesEditor({ startStr, endStr, onDone }: { startStr: string; endStr: string; onDone: () => void }) {
  const update = useUpdateTripDates();
  const [start, setStart] = useState(startStr);
  const [end, setEnd] = useState(endStr);

  const save = async () => {
    try {
      await update.mutateAsync({ startDate: start, endDate: end || undefined });
      toast.success("Даты обновлены");
      onDone();
    } catch (err) {
      toast.error("Не удалось сохранить даты", {
        description: err instanceof Error ? err.message : "Только владелец поездки",
      });
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2 relative z-20">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Вылет ✈️</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full min-h-11 text-xs rounded-lg border border-input bg-background px-2 py-2"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Прилёт обратно 🛬</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full min-h-11 text-xs rounded-lg border border-input bg-background px-2 py-2"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 min-h-11 rounded-lg bg-secondary py-2 text-xs font-medium">
          Отмена
        </button>
        <button
          type="button"
          onClick={save}
          disabled={update.isPending}
          className="flex-1 min-h-11 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-medium disabled:opacity-50"
        >
          {update.isPending ? "…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
