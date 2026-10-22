"use client";

import { RotateCcw } from "lucide-react";

/** Плашка над формой: набранное в прошлый раз вернулось, его можно сбросить одним тапом. */
export function DraftNotice({ onClear }: { onClear: () => void }) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <RotateCcw className="size-3.5 text-primary" aria-hidden="true" />
        Черновик восстановлен
      </span>
      <button type="button" onClick={onClear} className="min-h-11 px-2 font-medium text-primary active:scale-95 transition-transform">
        Очистить
      </button>
    </div>
  );
}
