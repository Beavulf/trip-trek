"use client";

// Действия «в дороге» над проживанием: показать таксисту, проложить маршрут, позвонить,
// скопировать адрес. Одни и те же кнопки живут в герое («сегодня ночуем здесь») и
// в раскрытой карточке — тон меняется (на тёмном градиенте или на карточке).

import type { ReactNode } from "react";
import { Copy, Navigation, Phone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { googleDirectionsUrl, googleSearchUrl } from "@/lib/place-links";
import { phoneHref, type Lodging } from "@/lib/lodging";

export function routeUrl(l: Pick<Lodging, "lat" | "lng" | "address" | "name" | "city">): string | null {
  if (l.lat != null && l.lng != null) return googleDirectionsUrl(l.lat, l.lng);
  const q = [l.address || l.name, l.address ? null : l.city].filter(Boolean).join(", ");
  return q ? googleSearchUrl(q) : null;
}

export function copyText(text: string, okMessage: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(okMessage),
    () => toast.error("Не удалось скопировать")
  );
}

type Tone = "hero" | "card";

const base = "min-h-11 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 px-3 active:scale-[0.97] transition-transform";
const secondary: Record<Tone, string> = {
  hero: "bg-white/15 text-white hover:bg-white/25 backdrop-blur",
  card: "border border-border bg-card hover:bg-muted",
};

export function StayActions({
  lodging,
  tone,
  onTaxi,
}: {
  lodging: Lodging;
  tone: Tone;
  onTaxi: () => void;
}) {
  const route = routeUrl(lodging);
  const tel = phoneHref(lodging.phone);

  // Второстепенные кнопки идут парами; при нечётном числе последняя тянется на всю
  // ширину, иначе она одиноко повисает на полстроки
  const extras: ((cls: string) => ReactNode)[] = [];
  if (route) {
    extras.push((cls) => (
      <a key="route" href={route} target="_blank" rel="noopener noreferrer" className={cls}>
        <Navigation className="size-3.5" /> Маршрут
      </a>
    ));
  }
  if (tel) {
    extras.push((cls) => (
      <a key="tel" href={tel} className={cls}>
        <Phone className="size-3.5" /> Позвонить
      </a>
    ));
  }
  if (lodging.address) {
    extras.push((cls) => (
      <button key="addr" type="button" onClick={() => copyText(lodging.address ?? "", "Адрес скопирован")} className={cls}>
        <Copy className="size-3.5" /> Адрес
      </button>
    ));
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onTaxi}
        className={cn(
          base,
          "col-span-2 min-h-12 text-sm font-semibold",
          tone === "hero" ? "bg-white text-indigo-950 hover:bg-white/90" : "bg-primary text-primary-foreground"
        )}
      >
        🚕 Показать таксисту
      </button>
      {extras.map((render, i) =>
        render(cn(base, secondary[tone], extras.length % 2 === 1 && i === extras.length - 1 && "col-span-2"))
      )}
    </div>
  );
}
