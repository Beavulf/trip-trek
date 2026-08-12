"use client";

import { useWeather, useWeatherByCoords, useDays, useTrip } from "@/hooks/use-trip";
import { resolveCityCoords, hasCityCoords } from "@/lib/city-coords";
import { motion } from "framer-motion";
import { Sun, Wind, Droplets, CloudRain, Thermometer, Loader2, MapPin, AlertCircle, RotateCw, Cloud } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

interface WeatherCity {
  key: string;
  name: string;
  color: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  hasCoords: boolean;
}

export function WeatherPanel() {
  const { data: trip } = useTrip();
  const { data: days, isLoading: daysLoading } = useDays();
  const [selectedKey, setSelectedKey] = useState<string>("");
  const { setActiveTab } = useTripStore();

  // P0 #4: строим список городов из дней поездки
  const cities: WeatherCity[] = useMemo(() => {
    if (!days) return [];
    return days.map((d) => {
      // P1 #6: shared resolveCityCoords — единый словарь known cities + custom decode
      const resolved = resolveCityCoords(d.cityKey);
      if (resolved) {
        return {
          key: d.cityKey,
          name: d.city || resolved.name,
          color: d.accentColor || resolved.color || "#0ea5e9",
          lat: resolved.lat,
          lng: resolved.lng,
          timezone: resolved.timezone,
          hasCoords: true,
        };
      }
      // P1 #10: fallback — берём координаты первого места дня (как на Обзоре)
      const firstPlace = d.places?.find((p) => p.lat && p.lng);
      if (firstPlace) {
        return {
          key: d.cityKey || `place-${firstPlace.id}`,
          name: d.city,
          color: d.accentColor || "#0ea5e9",
          lat: firstPlace.lat,
          lng: firstPlace.lng,
          hasCoords: true,
        };
      }
      // Нет coords
      return {
        key: d.cityKey || "custom",
        name: d.city,
        color: d.accentColor || "#0ea5e9",
        hasCoords: false,
      };
    }).filter((c, idx, arr) => {
      // Уникальные по key
      return arr.findIndex((x) => x.key === c.key) === idx;
    });
  }, [days]);

  // Выбранный город (не fallback на guangzhou — P1 #7)
  const currentCity = cities.find((c) => c.key === selectedKey) || cities[0];

  // P0 #1: ОДИН путь запроса. Если есть coords → useWeatherByCoords. Если known city → useWeather.
  // Больше не запускаем оба хука параллельно.
  const hasCoords = currentCity?.hasCoords && currentCity?.lat != null && currentCity?.lng != null;
  const isKnownCity = currentCity ? hasCityCoords(currentCity.key) : false;

  // useWeatherByCoords — только при реальных coords
  const coordsQuery = useWeatherByCoords(
    hasCoords ? currentCity!.lat! : null,
    hasCoords ? currentCity!.lng! : null,
    currentCity?.name || "",
    currentCity?.timezone,
    7
  );

  // useWeather — только для known city БЕЗ coords в WeatherCity (custom key с coords уже покрыт выше)
  // На самом деле resolveCityCoords уже даёт coords для known cities, так что useWeather нужен
  // только если currentCity.hasCoords=false но key известный. Это маловероятно, но для надёжности.
  const legacyQuery = useWeather(
    !hasCoords && isKnownCity ? currentCity!.key : "",
    7
  );

  // Выбираем активный query
  const weather = hasCoords ? coordsQuery.data : legacyQuery.data;
  const isLoading = hasCoords ? coordsQuery.isLoading : legacyQuery.isLoading;
  const error = hasCoords ? coordsQuery.error : legacyQuery.error;
  const refetch = hasCoords ? coordsQuery.refetch : legacyQuery.refetch;

  // P0 #4: loading / нет trip / нет дней / ок
  if (daysLoading) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Загрузка погоды…
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <Cloud className="size-10 mx-auto opacity-50" />
        <p className="text-sm font-medium">Не выбрана поездка</p>
        <p className="text-xs">Выберите поездку в шапке, чтобы увидеть погоду</p>
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <CloudRain className="size-10 mx-auto opacity-50" />
        <p className="text-sm font-medium">Нет дней в маршруте</p>
        <p className="text-xs text-muted-foreground">Добавьте дни в Маршруте, чтобы увидеть погоду по городам</p>
        <button
          onClick={() => setActiveTab("itinerary")}
          className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
        >
          <MapPin className="size-3.5" /> Перейти в Маршрут
        </button>
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
          // P2 #14: второй цвет из accent города (не indigo #6366f1)
          background: `linear-gradient(135deg, ${currentCity?.color || "#0ea5e9"} 0%, ${darkenColor(currentCity?.color || "#0ea5e9")} 100%)`,
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
          ) : error ? (
            // P1 #5: error UI с retry
            <div className="py-4 space-y-2">
              <div className="flex items-center gap-2 text-white/90">
                <AlertCircle className="size-5" />
                <span className="text-sm font-medium">Не удалось загрузить погоду</span>
              </div>
              <p className="text-xs text-white/70">{error.message}</p>
              <button
                onClick={() => refetch()}
                className="mt-1 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 min-h-11"
              >
                <RotateCw className="size-3.5" /> Повторить
              </button>
            </div>
          ) : !currentCity?.hasCoords ? (
            // P0 #2: нет coords → CTA
            <div className="py-4 space-y-2">
              <p className="text-sm font-medium">Нет координат для «{currentCity?.name}»</p>
              <p className="text-xs text-white/70">Выберите город через автодополнение в Маршруте</p>
              <button
                onClick={() => setActiveTab("itinerary")}
                className="mt-1 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 min-h-11"
              >
                <MapPin className="size-3.5" /> Перейти в Маршрут
              </button>
            </div>
          ) : weather ? (
            <>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {weather.emoji} {weather.temperature}°
              </h1>
              <p className="text-white/80 text-sm mt-1">
                {weather.city} · {weather.label}
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs text-white/90 flex-wrap">
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
              {/* P1 #5: badge если fallback данные */}
              {weather.fallback && (
                <div className="mt-2 inline-flex items-center gap-1 text-[10px] bg-amber-500/30 text-white px-2 py-0.5 rounded-full">
                  ⚠ Примерные данные
                </div>
              )}
            </>
          ) : null}
        </div>
      </motion.div>

      {/* Выбор города — из дней поездки */}
      <div className="chip-rail no-scrollbar pb-1 px-1">
        {cities.map((c) => (
          <button
            key={c.key}
            onClick={() => setSelectedKey(c.key)}
            aria-label={`Погода: ${c.name}${!c.hasCoords ? " (нет координат)" : ""}`}
            className={cn(
              "min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0",
              (currentCity?.key === c.key) ? "text-white shadow-md" : "bg-card border border-border hover:bg-accent"
            )}
            style={currentCity?.key === c.key ? { background: c.color } : undefined}
          >
            <span className="size-1.5 rounded-full" style={{ background: c.color }} />
            {c.name}
            {!c.hasCoords && <span className="text-[9px] opacity-60">⚠</span>}
          </button>
        ))}
      </div>

      {/* Прогноз на 7 дней */}
      {weather?.forecast && weather.forecast.length > 0 ? (
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
      ) : weather && !weather.fallback ? (
          // P2 #13: forecast:[] — пояснение
          <div className="rounded-2xl bg-muted/30 border border-border p-4 text-center text-xs text-muted-foreground">
            Прогноз на неделю недоступен для этого города
          </div>
        ) : null}

      {/* Подсказка */}
      <p className="text-[11px] text-muted-foreground text-center px-4 flex items-center justify-center gap-1">
        <MapPin className="size-3" /> Данные: open-meteo.com · обновление каждые 10 мин
      </p>
    </div>
  );
}

// Затемняет hex цвет для градиента (вместо хардкоженного indigo)
function darkenColor(hex: string): string {
  // Простое затемнение: уменьшаем каждый компонент на ~20%
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#0c4a6e"; // fallback тёмно-синий
  const num = parseInt(m[1], 16);
  const r = Math.round(((num >> 16) & 0xff) * 0.7);
  const g = Math.round(((num >> 8) & 0xff) * 0.7);
  const b = Math.round((num & 0xff) * 0.7);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
