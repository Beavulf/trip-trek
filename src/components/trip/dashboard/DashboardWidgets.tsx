"use client";

import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { type TripSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ActivityChart({ trip }: { trip: TripSummary }) {
  // Подсчёт посещённых мест по дням
  const dayData = trip.days.map((d) => {
    const visited = d.places.filter((p) => p.status === "visited").length;
    const total = d.places.length;
    return {
      day: d.dayNumber,
      city: d.city,
      cityKey: d.cityKey,
      accentColor: d.accentColor,
      visited,
      total,
      pct: total > 0 ? Math.round((visited / total) * 100) : 0,
      isCurrent: d.dayNumber === trip.currentDayNumber,
      isPast: d.dayNumber < trip.currentDayNumber,
    };
  });

  const cityColors: Record<string, string> = {
    guangzhou: "#f97316",
    shenzhen: "#06b6d4",
    hongkong: "#ec4899",
    macau: "#8b5cf6",
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <CalendarDays className="size-4" /> Активность по дням
      </h2>

      <div className="flex items-end justify-between gap-1 h-24 mb-2">
        {dayData.map((d) => {
          const color = cityColors[d.cityKey] ?? "#f97316";
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap z-10 shadow-md pointer-events-none">
                {d.visited}/{d.total}
              </div>
              <div className="w-full flex-1 flex items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(d.pct, d.total > 0 ? 4 : 0)}%` }}
                  transition={{ duration: 0.6, delay: d.day * 0.03 }}
                  className={cn(
                    "w-full rounded-t-md transition-all",
                    d.isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-card"
                  )}
                  style={{
                    background: d.visited === 0 && !d.isPast ? "var(--muted)" : color,
                    opacity: d.visited === 0 && !d.isPast ? 0.4 : 1,
                  }}
                />
              </div>
              <span className={cn(
                "text-[8px] font-medium",
                d.isCurrent ? "text-primary" : "text-muted-foreground"
              )}>
                {d.day}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground pt-2 border-t border-border">
        {Object.entries({
          guangzhou: "Гуанчжоу",
          shenzhen: "Шэньчжэнь",
          hongkong: "Гонконг",
          macau: "Макао",
        }).map(([key, name]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: cityColors[key] }} />
            {name}
          </span>
        ))}
        <span className="ml-auto">
          {trip.visitedPlaces}/{trip.totalPlaces} мест посещено
        </span>
      </div>
    </div>
  );
}

export function DailyTip({ trip }: { trip: TripSummary }) {
  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  if (!currentDay) return null;

  const cityTips: Record<string, string[]> = {
    guangzhou: [
      "Попробуйте уличную еду на Шансяцзю — чашеобразная лапша и манго саго!",
      "Круиз по Жемчужной реке лучше всего на закате (~18:30-19:00)",
      "На Beijing Road под стеклянным полом видны древние мостовые",
      "Димсамы в Yonghe Palace — классика кантонской кухни",
    ],
    shenzhen: [
      "Смотровая Free Sky на 116 этаже Ping An — билеты от $44",
      "OCT-LOFT — модный район с галереями и % Arabica",
      "Haidilao — хот-пот с легендарным сервисом",
      "Пляж Дамейша — атмосфера французского курорта",
    ],
    hongkong: [
      "Пик Виктория — поднимайтесь на историческом трамвайчике",
      "Симфония огней в 20:00 на набережной Чимсачёй",
      "Ozone — самый высокий бар мира (118 этаж Ritz-Carlton)",
      "Lan Kwai Fong — центр ночной жизни Гонконга",
    ],
    macau: [
      "Lord Stow's Bakery — легендарные португальские яичные тарты",
      "Казино можно просто осматривать — это бесплатно!",
      "Бесплатные шаттлы от казино до паромных терминалов",
      "Rua do Cunha — пешеходная улица с деликатесами",
    ],
  };

  const tips = cityTips[currentDay.cityKey] ?? [];
  if (tips.length === 0) return null;

  const tipIndex = (trip.currentDayNumber - 1) % tips.length;
  const tip = tips[tipIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/30 p-4 relative overflow-hidden"
    >
      <div className="absolute -top-3 -right-3 size-16 rounded-full bg-violet-500/10 blur-xl" />
      <div className="relative flex items-start gap-3">
        <div className="size-10 rounded-xl bg-violet-500/20 grid place-items-center text-xl shrink-0">
          💡
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-0.5">
            Совет дня · {currentDay.city}
          </div>
          <p className="text-sm leading-relaxed">{tip}</p>
        </div>
      </div>
    </motion.div>
  );
}
