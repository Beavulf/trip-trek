"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import type { MapLayerKey } from "@/lib/map-layers";

export type { MapLayerKey };

interface LayersSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  autoTheme: boolean;
  onAutoTheme: (v: boolean) => void;
  manualLayer: MapLayerKey;
  onManualLayer: (l: MapLayerKey) => void;
  activeLayer: MapLayerKey;
  isDarkTheme: boolean;
  /** Подсказка про карты в Китае и т.п. */
  note?: string | null;
}

/** CSS-превью стиля подложки — не тайлы, только характер */
const LAYER_CARDS: { key: MapLayerKey; label: string; hint: string; preview: string; badge: string }[] = [
  {
    key: "voyager",
    label: "Классическая",
    hint: "OpenStreetMap",
    preview: "linear-gradient(135deg,#f6f3ee 0%,#eadfce 55%,#cfe3d8 100%)",
    badge: "🗺️",
  },
  {
    key: "satellite",
    label: "Спутник",
    hint: "фото со спутника",
    preview: "linear-gradient(135deg,#2e4a2f 0%,#6b7a3a 45%,#3d5a6b 100%)",
    badge: "🛰️",
  },
  {
    key: "dark",
    label: "Тёмная",
    hint: "для ночи",
    preview: "linear-gradient(135deg,#191b1e 0%,#2a2d31 60%,#3a3e43 100%)",
    badge: "🌙",
  },
  {
    key: "light",
    label: "Светлая",
    hint: "минимум красок",
    preview: "linear-gradient(135deg,#fafafa 0%,#ececec 60%,#e0e0e0 100%)",
    badge: "⚪",
  },
];

export function LayersSheet({
  open,
  onOpenChange,
  autoTheme,
  onAutoTheme,
  manualLayer,
  onManualLayer,
  activeLayer,
  isDarkTheme,
  note,
}: LayersSheetProps) {
  if (!open) return null;

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Стиль карты"
      contentClassName="space-y-3"
    >
      {/* Авто — следует за темой */}
      <button
        type="button"
        onClick={() => onAutoTheme(true)}
        aria-pressed={autoTheme}
        className={cn(
          "w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors min-h-11",
          autoTheme ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"
        )}
      >
        <span
          className="size-12 rounded-xl grid place-items-center text-xl shrink-0"
          style={{
            background: isDarkTheme
              ? "linear-gradient(135deg,#14181f,#2c313b)"
              : "linear-gradient(135deg,#f6f3ee,#cfe3d8)",
          }}
        >
          {isDarkTheme ? "🌙" : "☀️"}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold">Как в приложении</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            Меняется вместе с темой — сейчас {isDarkTheme ? "тёмная" : "светлая"}
          </span>
        </span>
        {autoTheme && <SelectedMark />}
      </button>

      {/* Ручные подложки */}
      <div className="grid grid-cols-2 gap-2">
        {LAYER_CARDS.map((l) => {
          const selected = !autoTheme && manualLayer === l.key;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => onManualLayer(l.key)}
              aria-pressed={selected}
              className={cn(
                "relative rounded-2xl border p-2.5 text-left transition-colors",
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
              )}
            >
              <span
                className="block h-16 rounded-xl border border-black/5"
                style={{ background: l.preview }}
              />
              <span className="flex items-center gap-1.5 mt-2">
                <span className="text-sm" aria-hidden="true">{l.badge}</span>
                <span className="text-sm font-semibold">{l.label}</span>
                {selected && <SelectedMark className="ml-auto" />}
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">{l.hint}</span>
            </button>
          );
        })}
      </div>

      {note && (
        <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
          💡 {note}
        </p>
      )}
    </MobileBottomSheet>
  );
}

function SelectedMark({ className }: { className?: string }) {
  return (
    <span className={cn("size-5 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0", className)}>
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}
