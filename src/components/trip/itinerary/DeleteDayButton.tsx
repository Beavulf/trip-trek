"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useDeleteDay, useDays } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { toast } from "sonner";

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
        className="btn-icon-touch text-muted-foreground/30 cursor-not-allowed"
        title="Нельзя удалить единственный день"
        aria-label="Нельзя удалить единственный день"
      >
        <Trash2 className="size-4" />
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        className="btn-icon-touch hover:bg-destructive/10 hover:text-destructive text-muted-foreground active:scale-90"
        title="Удалить день"
        aria-label={`Удалить день ${dayNumber}`}
      >
        <Trash2 className="size-4" />
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
        className="btn-confirm-yes"
      >
        {deleteDay.isPending ? "…" : "Удалить"}
      </button>
      <button onClick={() => setConfirming(false)} className="btn-confirm-no">
        Отмена
      </button>
    </div>
  );
}
