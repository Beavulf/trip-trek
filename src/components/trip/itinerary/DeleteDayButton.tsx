"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useDeleteDay } from "@/hooks/use-trip";
import { toast } from "sonner";

interface DeleteDayButtonProps {
  dayId: string;
  dayNumber: number;
}

export function DeleteDayButton({ dayId, dayNumber }: DeleteDayButtonProps) {
  const deleteDay = useDeleteDay();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        className="size-7 rounded-lg hover:bg-destructive/10 hover:text-destructive grid place-items-center transition-colors text-muted-foreground"
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
            onSuccess: () => toast.success(`День ${dayNumber} удалён`),
            onError: (e) => toast.error(e.message),
          });
        }}
        disabled={deleteDay.isPending}
        className="text-[10px] bg-destructive text-destructive-foreground px-2 py-1 rounded-lg font-medium"
      >
        {deleteDay.isPending ? "…" : "Удалить?"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-[10px] bg-secondary px-2 py-1 rounded-lg"
      >
        Отмена
      </button>
    </div>
  );
}
