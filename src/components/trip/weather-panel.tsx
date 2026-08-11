"use client";

import { useWeather, useWeatherByCoords, useDays } from "@/hooks/use-trip";
import { CITIES } from "@/lib/types";
import { motion } from "framer-motion";
import { Sun, Wind, Droplets, CloudRain, Thermometer, Loader2, MapPin } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

interface WeatherCity {
  key: string;
  name: string;
  color: string;
  lat?: number;
  lng?: number;
  timezone?: string;
}

export function WeatherPanel() {
  const { data: days } = useDays();
  const [selectedKey, setSelectedKey] = useState<string>("");

  // Строим список городов из дней поездки + legacy города
  const cities: WeatherCity[] = useMemo(() => {
    const fromDays: WeatherCity[] = (days || []).map((d) => {
      // Если cityKey — legacy (guangzhou, shenzhen, etc), берём координаты оттуда
      const legacy = CITIES.find((c) => c.key === d.cityKey);
      if (legacy) {
        return { key: d.cityKey, name: d.city, color: d.accentColor || legacy.color, lat: legacy.lat, lng: legacy.lng };
      }
      // Иначе пытаемся извлечь координаты из cityKey формата "custom-lat-lng"
      if (d.cityKey?.startsWith("custom-")) {
        const parts = d.cityKey.split("-");
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { key: d.cityKey, name: d.city, color: d.accentColor || "#f97316", lat, lng };
        }
      }
      // Fallback — без координат, используем legacy
      return { key: d.cityKey || "custom", name: d.city, color: d.accentColor || "#f97316" };
    });

    // Уникальные по key
    const seen = new Set<string>();
    const unique = fromDays.filter((c) => {
      if (seen.has(c.key)) return false;
      seen.add(c.key);
      return true;
    });

    return unique;
  }, [days]);

  // Выбранный город
  const currentCity = cities.find((c) => c.key === selectedKey) || cities[0];

  // Погода: по координатам если есть, иначе legacy
  const hasCoords = currentCity?.lat != null && currentCity?.lng != null;
  const { data: weatherCoords, isLoading: loadingCoords } = useWeatherByCoords(
    currentCity?.lat || 0,
    currentCity?.lng || 0,
    currentCity?.name || "",
    currentCity?.timezone,
    7
  );
  const { data: weatherLegacy, isLoading: loadingLegacy } = useWeather(currentCity?.key || "", 7);

  const weather = hasCoords ? weatherCoords : weatherLegacy;
  const isLoading = hasCoords ? loadingCoords : loadingLegacy;

  // Если городов нет
  if (cities.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <CloudRain className="size-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Добавьте дни в маршрут, чтобы увидеть погоду</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero — текущая погода */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${currentCity?.color || "#0ea5e9"} 0%, #6366f1 100%)`,
        }}
      >
        <div className="absolute -top-4 -right-2 text-[120px] opacity-15 select-none leading-none">
          {weather?.emoji || "☀️"}
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Sun className="size-4" /> Погода
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="size-5 animate-spin" /> Загрузка…
            </div>
          ) : weather ? (
            <>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {weather.emoji} {weather.temperature}°
              </h1>
              <p className="text-white/80 text-sm mt-1">
                {weather.city} · {weather.label}
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs text-white/90">
                <span className="flex items-center gap-1">
                  <Thermometer className="size-3.5" /> {weather.min}°–{weather.max}°
                </span>
                <span className="flex items-center gap-1">
                  <Wind className="size-3.5" /> {weather.wind} км/ч
                </span>
                <span className="flex items-center gap-1">
                  <Droplets className="size-3.5" /> {weather.humidity}%
                </span>
              </div>
              <p className="text-[11px] text-white/70 mt-2">
                Ощущается как {weather.apparent}°
              </p>
            </>
          ) : null}
        </div>
      </motion.div>

      {/* Выбор города — из дней поездки */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {cities.map((c) => (
          <button
            key={c.key}
            onClick={() => setSelectedKey(c.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
              (currentCity?.key === c.key) ? "text-white shadow-md" : "bg-card border border-border hover:bg-accent"
            )}
            style={currentCity?.key === c.key ? { background: c.color } : undefined}
          >
            <span className="size-1.5 rounded-full" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      {/* Прогноз на 7 дней */}
      {weather?.forecast && weather.forecast.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <CloudRain className="size-4" /> Прогноз на 7 дней
          </h2>
          <div className="space-y-1.5">
            {weather.forecast.map((day, i) => {
              const date = new Date(day.date);
              const weekday = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : WEEKDAYS[date.getDay()];
              const dayNum = date.getDate();
              const month = date.toLocaleString("ru-RU", { month: "short" });
              return (
                <motion.div
                  key={day.date}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="w-16 shrink-0">
                    <div className="text-sm font-medium">{weekday}</div>
                    <div className="text-[10px] text-muted-foreground">{dayNum} {month}</div>
                  </div>
                  <div className="text-2xl shrink-0 w-10 text-center">{day.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">{day.label}</div>
                    {day.precip > 0 && (
                      <div className="text-[10px] text-sky-500 flex items-center gap-0.5">
                        <CloudRain className="size-2.5" /> {day.precip}%
                      </div>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="text-sm font-semibold text-red-400">{day.max}°</span>
                    <span className="text-xs text-muted-foreground">{day.min}°</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Подсказка */}
      <p className="text-[11px] text-muted-foreground text-center px-4 flex items-center justify-center gap-1">
        <MapPin className="size-3" /> Данные: open-meteo.com · обновление каждые 10 мин
      </p>
    </div>
  );
}
