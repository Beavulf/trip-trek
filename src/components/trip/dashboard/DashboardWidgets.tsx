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

  // Динамические цвета из данных дней (не хардкод Китай)
  const cityColors = new Map<string, string>();
  dayData.forEach((d) => {
    if (!cityColors.has(d.cityKey)) {
      cityColors.set(d.cityKey, d.accentColor || "#f97316");
    }
  });

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <CalendarDays className="size-4" /> Активность по дням
      </h2>

      <div className="flex items-end justify-between gap-1 h-24 mb-2">
        {dayData.map((d) => {
          const color = cityColors.get(d.cityKey) ?? "#f97316";
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

      {/* Легенда городов — из данных поездки, не хардкод */}
      {dayData.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground pt-2 border-t border-border">
          {[...new Map(dayData.map((d) => [d.cityKey, d])).values()].map((d) => (
            <span key={d.cityKey} className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: cityColors.get(d.cityKey) }} />
              {d.city}
            </span>
          ))}
          <span className="ml-auto">
            {trip.visitedPlaces}/{trip.totalPlaces} мест посещено
          </span>
        </div>
      )}
    </div>
  );
}

export function DailyTip({ trip }: { trip: TripSummary }) {
  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  if (!currentDay) return null;

  // Общие советы для любого города + специфичные для известных
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
    ],
    hongkong: [
      "Пик Виктория — поднимайтесь на историческом трамвайчике",
      "Симфония огней в 20:00 на набережной Чимсачёй",
      "Lan Kwai Fong — центр ночной жизни Гонконга",
    ],
    macau: [
      "Lord Stow's Bakery — легендарные португальские яичные тарты",
      "Казино можно просто осматривать — это бесплатно!",
      "Rua do Cunha — пешеходная улица с деликатесами",
    ],
    tokyo: [
      "Суши на Цукидзи — самый свежий улов с утра",
      "Сибуя на закате — перекрёсток в огнях",
      "Янака — старый Токио с атмосферой прошлого",
    ],
    paris: [
      "Эйфелева башня — приходите к 18:00 для заката",
      "Латинский квартал — дешёвые бистро и студенческая атмосфера",
      "Монмартр — художники и вид на весь Париж",
    ],
  };

  // Нейтральные советы для неизвестных городов
  const genericTips = [
    "Спросите местных о лучшем месте для обеда — они знают!",
    "Сделайте фото на главную достопримечательность города",
    "Попробуйте местную уличную еду — это самый честный вкус города",
    "Загляните в местную кофейню — там уютнее, чем в сетевых",
    "Пройдитесь пешком утром — города открываются по-другому",
    "Купите сувенир на местном рынке, а не в туристическом магазине",
  ];

  const tips = cityTips[currentDay.cityKey] ?? genericTips;
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
