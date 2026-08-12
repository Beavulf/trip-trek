"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useDeleteDay, useDays } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DeleteDayButtonProps {
  dayId: string;
  dayNumber: number;
}

export function DeleteDayButton({ dayId, dayNumber }: DeleteDayButtonProps) {
  const deleteDay = useDeleteDay();
  const { data: days } = useDays();
  const { setSelectedDay } = useTripStore();
  const [confirming, setConfirming] = useState(false);

  const isLastDay = (days?.length ?? 1) <= 1;

  if (isLastDay) {
    return (
      <button
        disabled
        onClick={(e) => e.stopPropagation()}
        className="size-7 rounded-lg grid place-items-center text-muted-foreground/30 cursor-not-allowed"
        title="Нельзя удалить единственный день"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        className="size-8 rounded-lg hover:bg-destructive/10 hover:text-destructive grid place-items-center transition-colors text-muted-foreground active:scale-90"
        title="Удалить день"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          deleteDay.mutate(dayId, {
            onSuccess: () => {
              toast.success(`День ${dayNumber} удалён`);
              setSelectedDay(null);
            },
            onError: (e) => toast.error(e.message),
          });
        }}
        disabled={deleteDay.isPending}
        className="text-[11px] bg-destructive text-destructive-foreground px-2.5 py-1.5 rounded-lg font-medium"
      >
        {deleteDay.isPending ? "…" : "Удалить"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-[11px] bg-secondary px-2.5 py-1.5 rounded-lg"
      >
        Отмена
      </button>
    </div>
  );
}
