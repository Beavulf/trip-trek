"use client";

import { useDays } from "@/hooks/use-trip";
import { motion } from "framer-motion";
import { Train, Ship, Clock, DollarSign, MapPin, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { CITIES } from "@/lib/types";
import { cn } from "@/lib/utils";

// Переезды между городами (из плана путешествия)
const TRANSFERS = [
  {
    from: { key: "guangzhou", name: "Гуанчжоу" },
    to: { key: "shenzhen", name: "Шэньчжэнь" },
    type: "train",
    duration: "30-40 мин",
    cost: "$5-10",
    dayNumber: 5,
    icon: "🚄",
    note: "Скоростной поезд. Станции Guangzhou East/Shenzhen North.",
  },
  {
    from: { key: "shenzhen", name: "Шэньчжэнь" },
    to: { key: "hongkong", name: "Гонконг" },
    type: "ferry",
    duration: "1 час",
    cost: "$15-20",
    dayNumber: 8,
    icon: "⛴️",
    note: "Паром из Shekou Cruise Center в Hong Kong Macau Ferry Terminal.",
  },
  {
    from: { key: "hongkong", name: "Гонконг" },
    to: { key: "macau", name: "Макао" },
    type: "ferry",
    duration: "1 час",
    cost: "$15-20",
    dayNumber: 12,
    icon: "⛴️",
    note: "Паром из Hong Kong Macau Ferry Terminal. Билеты лучше купить заранее.",
  },
];

const TRANSFER_META: Record<string, { label: string; icon: typeof Train; color: string }> = {
  train: { label: "Скоростной поезд", icon: Train, color: "#06b6d4" },
  ferry: { label: "Паром", icon: Ship, color: "#0ea5e9" },
};

export function TransportMap() {
  const { data: days } = useDays();

  // Определяем статус каждого переезда по посещённым местам
  const getTransferStatus = (dayNumber: number): "done" | "current" | "upcoming" => {
    if (!days) return "upcoming";
    const day = days.find((d) => d.dayNumber === dayNumber);
    if (!day) return "upcoming";
    const visited = day.places.filter((p) => p.status === "visited").length;
    if (visited >= day.places.length / 2) return "done";
    if (visited > 0) return "current";
    // Проверяем предыдущие дни
    const prevDays = days.filter((d) => d.dayNumber < dayNumber);
    const prevVisited = prevDays.every((d) => d.places.filter((p) => p.status === "visited").length > 0);
    return prevVisited ? "current" : "upcoming";
  };

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">🚄</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Train className="size-4" /> Транспорт
          </div>
          <h1 className="text-2xl font-bold">Переезды между городами</h1>
          <p className="text-white/80 text-sm mt-1">4 города · 3 переезда · ~2.5 часа в пути</p>
        </div>
      </div>

      {/* Схема маршрута — горизонтальная на десктопе, вертикальная на мобиле */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <MapPin className="size-4" /> Маршрут поездки
        </h2>

        {/* Горизонтальная схема городов */}
        <div className="flex items-center justify-between gap-1 mb-6">
          {CITIES.map((city, i) => (
            <div key={city.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className="size-10 sm:size-12 rounded-full grid place-items-center text-white font-bold text-xs sm:text-sm shadow-md shrink-0"
                  style={{ background: city.color }}
                >
                  {i + 1}
                </div>
                <div className="text-[10px] sm:text-xs font-medium text-center truncate w-full">
                  {city.name}
                </div>
              </div>
              {i < CITIES.length - 1 && (
                <div className="flex-1 h-0.5 bg-border relative mx-1 sm:mx-2">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary transition-all"
                    style={{
                      width: getTransferStatus(TRANSFERS[i]?.dayNumber ?? 99) === "done" ? "100%" : "0%",
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Карточки переездов */}
        <div className="space-y-3">
          {TRANSFERS.map((transfer, i) => {
            const status = getTransferStatus(transfer.dayNumber);
            const meta = TRANSFER_META[transfer.type];
            const Icon = meta?.icon;
            const fromCity = CITIES.find((c) => c.key === transfer.from.key);
            const toCity = CITIES.find((c) => c.key === transfer.to.key);

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "rounded-2xl border p-4 relative overflow-hidden",
                  status === "done" ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"
                )}
              >
                {/* Левая полоска */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ background: status === "done" ? "#22c55e" : meta?.color }}
                />

                <div className="flex items-start gap-3 ml-1">
                  {/* Иконка транспорта */}
                  <div
                    className="size-12 rounded-xl grid place-items-center text-2xl shrink-0"
                    style={{ background: `${meta?.color}22` }}
                  >
                    {transfer.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Маршрут */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: fromCity?.color }}>
                        {transfer.from.name}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="font-semibold text-sm" style={{ color: toCity?.color }}>
                        {transfer.to.name}
                      </span>
                      {status === "done" && (
                        <CheckCircle2 className="size-4 text-green-500 ml-1" />
                      )}
                    </div>

                    {/* Тип транспорта */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      {Icon && <Icon className="size-3.5" style={{ color: meta?.color }} />}
                      <span>{meta?.label}</span>
                      <span>·</span>
                      <span>День {transfer.dayNumber}</span>
                    </div>

                    {/* Детали */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                        <Clock className="size-3" /> {transfer.duration}
                      </span>
                      <span className="flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                        <DollarSign className="size-3" /> {transfer.cost}
                      </span>
                    </div>

                    {/* Заметка */}
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                      {transfer.note}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Советы по транспорту */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <h2 className="font-semibold text-sm mb-3">💡 Полезно знать</h2>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="text-base">🚇</span>
            <p>Метро в Гуанчжоу и Шэньчжэне: $0.5-1 за поездку. Оплата через Alipay.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-base">🚆</span>
            <p>В Гонконге: Octopus Card — для транспорта и покупок. MTR — быстрое метро.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-base">⛴️</span>
            <p>Паромы между городами: бронируйте заранее на Cotai Water Jet или TurboJET.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-base">🚌</span>
            <p>В Макао: бесплатные шаттлы от казино до паромных терминалов.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-base">📱</span>
            <p>Приложения: Metro Man, Citymapper для метро. Для навигации — Amap (高德地图).</p>
          </div>
        </div>
      </div>
    </div>
  );
}
