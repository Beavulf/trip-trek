"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useUpdateTripDates } from "@/hooks/use-trip";

/**
 * Редактор дат поездки. Живёт внутри градиентного hero «Обзора»,
 * поэтому оформлен в светлых тонах на прозрачном фоне (как инлайн-редактор бюджета).
 */
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
    <div className="mt-4 pt-4 border-t border-white/20 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-white/70 block mb-1">Вылет ✈️</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full min-h-11 text-xs rounded-xl bg-white/15 backdrop-blur px-2.5 text-white [color-scheme:dark] outline-none focus:ring-2 focus:ring-white/40"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-white/70 block mb-1">Прилёт обратно 🛬</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full min-h-11 text-xs rounded-xl bg-white/15 backdrop-blur px-2.5 text-white [color-scheme:dark] outline-none focus:ring-2 focus:ring-white/40"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 min-h-11 rounded-xl bg-white/15 hover:bg-white/25 text-white py-2 text-xs font-medium transition-colors"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={save}
          disabled={update.isPending}
          className="flex-1 min-h-11 rounded-xl bg-white text-stone-900 py-2 text-xs font-semibold disabled:opacity-50 transition-opacity"
        >
          {update.isPending ? "…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
