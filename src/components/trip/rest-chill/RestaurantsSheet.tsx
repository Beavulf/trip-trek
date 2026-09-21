"use client";

import { useState } from "react";
import { Check, Loader2, MapPin, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AiDisclaimer } from "../ai-disclaimer";
import { useAiRestaurants, useCreatePlacesBatch, type RestaurantDraft } from "@/hooks/trip/use-ai-planner";

// «Рестораны рядом» — основная ИИ-фича раздела «Рядом» (переехала из Еды при
// схлопе дублей): реальные заведения OpenStreetMap у города дня маршрута,
// ИИ только отбирает разнообразную шестёрку и пишет «почему стоит зайти».
// Черновики: в маршрут попадает только отмеченное.

const FOOD_EMOJI_BY_CATEGORY: Record<string, string> = {
  restaurant: "🍽️",
  cafe: "☕",
  bar: "🍸",
  sight: "📍",
  park: "🌳",
};

export function RestaurantsSheet({
  open,
  onClose,
  days,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  days: { id: string; dayNumber: number; city: string }[];
  onAdded: () => void;
}) {
  const restaurants = useAiRestaurants();
  const batch = useCreatePlacesBatch();
  const [dayId, setDayId] = useState<string>(days[0]?.id ?? "");
  const [prefs, setPrefs] = useState("");
  const [drafts, setDrafts] = useState<RestaurantDraft[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  // Рендер-синхронизация при открытии (паттерн SettingsTab)
  const [synced, setSynced] = useState<string | null>(null);
  const syncKey = open ? `open:${days[0]?.id ?? ""}` : null;
  if (synced !== syncKey) {
    setSynced(syncKey);
    if (open) {
      setDayId(days[0]?.id ?? "");
      setPrefs("");
      setDrafts([]);
      setPicked(new Set());
      setNote(null);
    }
  }

  const find = async () => {
    if (!dayId) {
      toast.error("Сначала добавьте день в маршрут");
      return;
    }
    try {
      const res = await restaurants.mutateAsync({ dayId, preferences: prefs.trim() || undefined });
      setDrafts(res.drafts ?? []);
      setPicked(new Set((res.drafts ?? []).map((d) => d.name)));
      setNote(res.note ?? null);
      if ((res.drafts ?? []).length === 0 && res.note) toast(res.note);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось найти заведения");
    }
  };

  const apply = async () => {
    const items = drafts.filter((d) => picked.has(d.name));
    if (items.length === 0) return;
    try {
      const res = await batch.mutateAsync(
        items.map((d) => ({
          dayId,
          name: d.name,
          category: d.category,
          lat: d.lat,
          lng: d.lng,
          description: d.why,
          address: d.address,
        }))
      );
      toast.success(`Заведений в маршрут: ${res.created}`);
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить заведения");
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={(v) => !v && onClose()} title="Рестораны рядом" titleIcon={<MapPin className="size-4" />}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">день маршрута</p>
          <div className="flex flex-wrap gap-1.5">
            {days.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={dayId === d.id}
                onClick={() => setDayId(d.id)}
                className={cn(
                  "px-3 min-h-9 rounded-full text-xs font-medium transition-colors",
                  dayId === d.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                Д{d.dayNumber} · {d.city}
              </button>
            ))}
          </div>
        </div>

        <input
          value={prefs}
          onChange={(e) => setPrefs(e.target.value)}
          maxLength={200}
          placeholder="Пожелания: суши, тихое место, с видом… (необязательно)"
          className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
          aria-label="Пожелания к подборке заведений"
        />

        <button
          type="button"
          onClick={find}
          disabled={restaurants.isPending || !dayId}
          className="w-full min-h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          {restaurants.isPending ? <Loader2 className="size-4 animate-spin" /> : restaurants.data ? <RotateCw className="size-4" /> : <MapPin className="size-4" />}
          {restaurants.isPending ? "Ищем в OpenStreetMap…" : drafts.length > 0 ? "Другая подборка" : "Найти заведения"}
        </button>

        {drafts.length > 0 && (
          <>
            <div className="space-y-1.5">
              {drafts.map((d) => {
                const on = picked.has(d.name);
                return (
                  <button
                    key={`${d.name}:${d.lat}`}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.name)) next.delete(d.name);
                        else next.add(d.name);
                        return next;
                      })
                    }
                    className={cn(
                      "w-full text-left rounded-2xl border p-3 flex items-start gap-2.5 transition-colors",
                      on ? "border-primary/50 bg-primary/5" : "border-border opacity-60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 size-6 rounded-lg border-2 grid place-items-center shrink-0",
                        on ? "bg-primary border-primary text-primary-foreground" : "border-border"
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <span aria-hidden>{FOOD_EMOJI_BY_CATEGORY[d.category] ?? "🍽️"}</span> {d.name}
                      </span>
                      <span className="block text-xs text-muted-foreground leading-snug mt-0.5">{d.why}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                        {[d.cuisine, d.address].filter(Boolean).join(" · ") || `~${Math.round(d.distance)} м от центра`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <AiDisclaimer />
            <button
              type="button"
              onClick={apply}
              disabled={batch.isPending || picked.size === 0}
              className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {batch.isPending ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              В маршрут · {picked.size} {plural(picked.size, "заведение", "заведения", "заведений")}
            </button>
          </>
        )}

        {note && drafts.length === 0 && <p className="text-xs text-muted-foreground">{note}</p>}
        {drafts.length === 0 && !restaurants.isPending && !note && (
          <AiDisclaimer text="Реальные заведения из OpenStreetMap поблизости от города выбранного дня — ИИ отберёт разнообразную подборку." />
        )}
      </div>
    </MobileBottomSheet>
  );
}
