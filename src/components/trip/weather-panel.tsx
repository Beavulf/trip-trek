"use client";

import { useWeather, useWeatherByCoords, useCitiesWeather, useRouteDays, useTrip } from "@/hooks/use-trip";
import { resolveCityCoords, hasCityCoords } from "@/lib/city-coords";
import { motion } from "framer-motion";
import {
  Sun,
  Wind,
  Droplets,
  CloudRain,
  Loader2,
  MapPin,
  AlertCircle,
  RotateCw,
  Cloud,
  Clock,
  Lightbulb,
  Route as RouteIcon,
  CalendarDays,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

interface WeatherCity {
  key: string;
  name: string;
  color: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  hasCoords: boolean;
}

/* ---------- Хелперы дат ---------- */

/** Локальная дата устройства в формате "YYYY-MM-DD" (не UTC — иначе сдвиг на день). */
function localDateStr(d: Date | string): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/** "2026-09-12" → "12 сен" (без Date, чтобы не зависеть от таймзоны). */
function dateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`;
}

/** День недели по "YYYY-MM-DD" (полдень — защита от смены дня в таймзоне). */
function weekdayOf(dateStr: string): string {
  return WEEKDAYS[new Date(`${dateStr}T12:00:00`).getDay()] ?? "";
}

/** "2026-09-12T06:12" → "06:12" (время от open-meteo уже локальное для города). */
function hm(iso?: string | null): string {
  return iso ? iso.slice(11, 16) : "—";
}

/* ---------- Живое небо: палитра по погоде и дню/ночи ---------- */

interface SkyTheme {
  from: string;
  via: string;
  to: string;
  kind: "clear" | "cloud" | "rain" | "snow" | "storm" | "night";
}

function skyTheme(code: number, isDay: boolean): SkyTheme {
  if (!isDay) return { from: "#3730a3", via: "#1e1b4b", to: "#0f172a", kind: "night" };
  if (code <= 1) return { from: "#38bdf8", via: "#0ea5e9", to: "#1d4ed8", kind: "clear" };
  if (code === 2) return { from: "#7dd3fc", via: "#60a5fa", to: "#475569", kind: "cloud" };
  if (code === 3 || code === 45 || code === 48) return { from: "#94a3b8", via: "#64748b", to: "#475569", kind: "cloud" };
  if (code >= 71 && code <= 77) return { from: "#cbd5e1", via: "#94a3b8", to: "#64748b", kind: "snow" };
  if (code >= 95) return { from: "#6d28d9", via: "#4c1d95", to: "#0f172a", kind: "storm" };
  return { from: "#64748b", via: "#475569", to: "#1e293b", kind: "rain" };
}

/** Детерминированный псевдослучай из seed+индекса — частицы стабильны между рендерами. */
function seeded(seed: string, i: number, salt: number): number {
  let s = salt * 31;
  for (let k = 0; k < seed.length; k++) s += seed.charCodeAt(k) * (k + 7);
  s += i * 97;
  return (Math.abs(s) % 1000) / 1000;
}

function SkyParticles({ kind, seed }: { kind: SkyTheme["kind"]; seed: string }) {
  const drops = useMemo(() => {
    if (kind !== "rain" && kind !== "storm") return [];
    return Array.from({ length: 22 }, (_, i) => ({
      left: `${(seeded(seed, i, 1) * 100).toFixed(1)}%`,
      height: 10 + Math.round(seeded(seed, i, 2) * 8),
      duration: `${(0.7 + seeded(seed, i, 3) * 0.6).toFixed(2)}s`,
      delay: `${(seeded(seed, i, 4) * 1.4).toFixed(2)}s`,
    }));
  }, [kind, seed]);

  const flakes = useMemo(() => {
    if (kind !== "snow") return [];
    return Array.from({ length: 16 }, (_, i) => ({
      left: `${(seeded(seed, i, 5) * 100).toFixed(1)}%`,
      size: 3 + Math.round(seeded(seed, i, 6) * 3),
      duration: `${(4 + seeded(seed, i, 7) * 4).toFixed(2)}s`,
      delay: `${(seeded(seed, i, 8) * 5).toFixed(2)}s`,
    }));
  }, [kind, seed]);

  const stars = useMemo(() => {
    if (kind !== "night") return [];
    return Array.from({ length: 24 }, (_, i) => ({
      left: `${(seeded(seed, i, 9) * 100).toFixed(1)}%`,
      top: `${(seeded(seed, i, 10) * 60).toFixed(1)}%`,
      size: 1.5 + Math.round(seeded(seed, i, 11) * 1.5),
      duration: `${(1.6 + seeded(seed, i, 12) * 2.4).toFixed(2)}s`,
      delay: `${(seeded(seed, i, 13) * 3).toFixed(2)}s`,
    }));
  }, [kind, seed]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
      {/* Глубина: тёмная виньетка снизу для контраста текста */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
      {drops.map((d, i) => (
        <span
          key={`d${i}`}
          className="wx-drop absolute -top-5 w-[1.5px] rounded-full bg-gradient-to-b from-transparent via-white/50 to-white/70"
          style={{
            left: d.left,
            height: d.height,
            animation: `wx-fall ${d.duration} linear infinite`,
            animationDelay: d.delay,
          }}
        />
      ))}
      {flakes.map((f, i) => (
        <span
          key={`f${i}`}
          className="wx-flake absolute -top-3 rounded-full bg-white/80"
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            animation: `wx-fall ${f.duration} linear infinite`,
            animationDelay: f.delay,
          }}
        />
      ))}
      {stars.map((s, i) => (
        <span
          key={`s${i}`}
          className="wx-star absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animation: `wx-twinkle ${s.duration} ease-in-out infinite`,
            animationDelay: s.delay,
          }}
        />
      ))}
      {kind === "clear" && (
        <span
          className="wx-sunglow absolute -right-8 -top-10 size-44 rounded-full bg-white/30 blur-2xl"
          style={{ animation: "wx-pulse-soft 5s ease-in-out infinite" }}
        />
      )}
      {kind === "cloud" &&
        [0, 1, 2].map((i) => (
          <span
            key={`c${i}`}
            className="wx-cloudpuff absolute rounded-full bg-white/20 blur-xl"
            style={{
              left: `${8 + i * 30}%`,
              top: `${8 + i * 14}%`,
              width: 90 + i * 30,
              height: 34 + i * 8,
              animation: `wx-drift ${26 + i * 12}s ease-in-out infinite alternate`,
              animationDelay: `${i * -6}s`,
            }}
          />
        ))}
    </div>
  );
}

/* ---------- Советы путешественнику ---------- */

function buildAdvices(w: import("@/lib/types").Weather | undefined): string[] {
  if (!w) return [];
  const out: string[] = [];
  if (w.code >= 95) out.push("⛈️ Гроза — держите план Б в помещении");
  const rainHour = w.hours?.slice(0, 12).find((h) => h.precip >= 40);
  if (rainHour) out.push(`☔️ Зонт: дождь вероятен около ${rainHour.time.slice(11, 16)}`);
  const uv = w.uv ?? null;
  if (uv != null && uv >= 6) out.push(`🧴 UV ${Math.round(uv)} — крем от солнца и головной убор`);
  if (w.max >= 30) out.push(`💧 Жара до ${w.max}° — пейте больше воды`);
  if (w.max <= 0) out.push("🧣 Мороз — тёплая куртка и перчатки");
  if (w.code >= 71 && w.code <= 77) out.push("🧤 Снег — непромокаемая обувь");
  if (w.wind >= 25) out.push(`🌬️ Ветер до ${w.wind} км/ч — ветровка`);
  if (w.max - w.min >= 10) out.push(`🧅 Перепад ${w.min}°…${w.max}° — одевайтесь слоями`);
  if (out.length === 0) out.push("👌 Погода не мешает планам");
  return out.slice(0, 3);
}

function uvLabel(uv: number | null | undefined): string {
  if (uv == null) return "—";
  if (uv < 3) return "низкий";
  if (uv < 6) return "умеренный";
  if (uv < 8) return "высокий";
  if (uv < 11) return "оч. высокий";
  return "экстрим";
}

/* ---------- Скелетон ---------- */

function WeatherSkeleton() {
  return (
    <div className="space-y-4 pb-20">
      <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      <div className="flex gap-2 px-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[86px] w-[76px] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-10 animate-pulse rounded-full bg-muted" />
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

/* ---------- Главная панель ---------- */

export function WeatherPanel() {
  const { data: trip } = useTrip();
  const { data: days, isLoading: daysLoading } = useRouteDays();
  const [selectedKey, setSelectedKey] = useState<string>("");
  // null = авто: «По маршруту», если прогноз пересекается с днями поездки
  const [view, setView] = useState<"route" | "city" | null>(null);
  const { setActiveTab } = useTripStore();
  const [now, setNow] = useState(() => new Date());

  // Местное время города тикает раз в 30 сек
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Города маршрута из дней (unique по key)
  const cities: WeatherCity[] = useMemo(() => {
    if (!days) return [];
    const list = days.map((d) => {
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
      return {
        key: d.cityKey || "custom",
        name: d.city,
        color: d.accentColor || "#0ea5e9",
        hasCoords: false,
      };
    });
    return list.filter((c, idx, arr) => arr.findIndex((x) => x.key === c.key) === idx);
  }, [days]);

  // Погода всех городов разом (рельс + прогноз «по маршруту»).
  // Если маршрут начинается позже сегодняшнего дня — второе окно прогноза от даты старта,
  // чтобы открытый 7-дневный прогноз доставал до первых дней поездки.
  const upcomingDay = useMemo(() => {
    if (!days?.length) return null;
    const todayStr = localDateStr(new Date());
    return (
      [...days].sort((a, b) => a.dayNumber - b.dayNumber).find((d) => localDateStr(d.date) >= todayStr) ?? null
    );
  }, [days]);
  const routeStart = useMemo(() => {
    if (!upcomingDay) return null;
    const s = localDateStr(upcomingDay.date);
    return s > localDateStr(new Date()) ? s : null;
  }, [upcomingDay]);

  const citiesWithCoords = useMemo(
    () =>
      cities
        .filter((c) => c.hasCoords && c.lat != null && c.lng != null)
        .map((c) => ({ key: c.key, name: c.name, lat: c.lat!, lng: c.lng!, timezone: c.timezone })),
    [cities]
  );
  const citiesWeather = useCitiesWeather(citiesWithCoords, routeStart);

  const currentCity = cities.find((c) => c.key === selectedKey) || cities[0];

  // Один путь запроса для героя: coords → useWeatherByCoords, иначе known-city fallback
  const hasCoords = currentCity?.hasCoords && currentCity?.lat != null && currentCity?.lng != null;
  const isKnownCity = currentCity ? hasCityCoords(currentCity.key) : false;

  const coordsQuery = useWeatherByCoords(
    hasCoords ? currentCity!.lat! : null,
    hasCoords ? currentCity!.lng! : null,
    currentCity?.name || "",
    currentCity?.timezone,
    7
  );
  const legacyQuery = useWeather(!hasCoords && isKnownCity ? currentCity!.key : "", 7);

  const weather = hasCoords ? coordsQuery.data : legacyQuery.data;
  const isLoading = hasCoords ? coordsQuery.isLoading : legacyQuery.isLoading;
  const isFetching = hasCoords ? coordsQuery.isFetching : legacyQuery.isFetching;
  const error = hasCoords ? coordsQuery.error : legacyQuery.error;
  const refetch = hasCoords ? coordsQuery.refetch : legacyQuery.refetch;

  /* Прогноз, сшитый с маршрутом: день N + его город + прогноз его города.
     fc берём из окна от даты старта (будущие поездки) или из обычного прогноза. */
  const routeRows = useMemo(() => {
    if (!days?.length) return [];
    const todayStr = localDateStr(new Date());
    return [...days]
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((d) => {
        const dateStr = localDateStr(d.date);
        const city = cities.find((c) => c.key === d.cityKey) || cities.find((c) => c.name === d.city);
        const entry = city ? citiesWeather.get(city.key) : undefined;
        const fc =
          entry?.routeForecast?.find((f) => f.date === dateStr) ??
          entry?.data?.forecast?.find((f) => f.date === dateStr);
        return { day: d, dateStr, city, fc, isToday: dateStr === todayStr };
      })
      .filter((r) => r.dateStr >= todayStr)
      .slice(0, 7);
  }, [days, cities, citiesWeather]);

  const activeView: "route" | "city" = view ?? (routeRows.length > 0 ? "route" : "city");

  /* Местное время выбранного города */
  const cityTime = useMemo(() => {
    const tz = weather?.timezone || currentCity?.timezone;
    if (!tz) return null;
    try {
      return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now);
    } catch {
      return null;
    }
  }, [now, weather?.timezone, currentCity?.timezone]);

  const sky = skyTheme(weather?.code ?? 0, weather?.isDay ?? true);
  const advices = useMemo(() => buildAdvices(weather), [weather]);

  /* Диапазон недели для полос температур (вид «7 дней») */
  const weekRange = useMemo(() => {
    const fc = weather?.forecast ?? [];
    if (fc.length === 0) return null;
    const min = Math.min(...fc.map((d) => d.min));
    const max = Math.max(...fc.map((d) => d.max));
    return { min, max, span: Math.max(1, max - min) };
  }, [weather]);

  /* ---------- Ранние состояния ---------- */

  if (daysLoading) return <WeatherSkeleton />;

  if (!trip) {
    return (
      <div className="space-y-2 py-16 text-center text-muted-foreground">
        <Cloud className="mx-auto size-10 opacity-50" />
        <p className="text-sm font-medium">Не выбрана поездка</p>
        <p className="text-xs">Выберите поездку в шапке, чтобы увидеть погоду</p>
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <div className="space-y-2 py-16 text-center text-muted-foreground">
        <CloudRain className="mx-auto size-10 opacity-50" />
        <p className="text-sm font-medium">В маршруте пока нет дней</p>
        <p className="text-xs text-muted-foreground">Добавьте дни с городами — и здесь появится прогноз по маршруту</p>
        <button
          onClick={() => setActiveTab("itinerary")}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
        >
          <MapPin className="size-3.5" /> Перейти в Маршрут
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-4 pb-20">
      {/* ─── Герой: живое небо ─── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl"
        style={{ background: `linear-gradient(160deg, ${sky.from} 0%, ${sky.via} 55%, ${sky.to} 100%)` }}
        aria-label={`Погода: ${currentCity?.name ?? ""}`}
      >
        <SkyParticles kind={sky.kind} seed={currentCity?.key ?? "sky"} />
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-white/75">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{currentCity?.name}</span>
              </div>
              {cityTime && !isLoading && weather && (
                <div className="mt-0.5 text-[11px] text-white/60">Местное время {cityTime}</div>
              )}
            </div>
            {hasCoords && (
              <button
                type="button"
                onClick={() => refetch()}
                aria-label="Обновить погоду"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur transition-transform active:scale-95"
              >
                <RotateCw className={cn("size-4", isFetching && "animate-spin")} />
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-8">
              <Loader2 className="size-5 animate-spin" /> <span className="text-sm text-white/80">Загрузка…</span>
            </div>
          ) : error ? (
            <div className="py-4">
              <div className="flex items-center gap-2 text-white/90">
                <AlertCircle className="size-5" />
                <span className="text-sm font-medium">Не удалось загрузить погоду</span>
              </div>
              <p className="mt-1 text-xs text-white/70">{error.message}</p>
              <button
                onClick={() => refetch()}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-xs font-medium hover:bg-white/30"
              >
                <RotateCw className="size-3.5" /> Повторить
              </button>
            </div>
          ) : !currentCity?.hasCoords ? (
            <div className="py-4">
              <p className="text-sm font-medium">Нет координат для «{currentCity?.name}»</p>
              <p className="mt-1 text-xs text-white/70">Выберите город через автодополнение в Маршруте</p>
              <button
                onClick={() => setActiveTab("itinerary")}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-xs font-medium hover:bg-white/30"
              >
                <MapPin className="size-3.5" /> Перейти в Маршрут
              </button>
            </div>
          ) : weather ? (
            <>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-7xl font-extralight leading-none tabular-nums">{weather.temperature}</span>
                <span className="-ml-1 mt-4 text-3xl font-extralight leading-none">°</span>
                <span className="text-5xl leading-none" aria-hidden>
                  {weather.emoji}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/85">
                {weather.label} · ощущается как {weather.apparent}°
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/80">
                <span className="tabular-nums">↑ {weather.max}° ↓ {weather.min}°</span>
                <span className="flex items-center gap-1">
                  <Wind className="size-3.5" /> {weather.wind} км/ч
                </span>
                <span className="flex items-center gap-1">
                  <Droplets className="size-3.5" /> {weather.humidity}%
                </span>
              </div>
              {weather.fallback && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] text-white">
                  ⚠ Примерные данные
                </div>
              )}
            </>
          ) : null}
        </div>
      </motion.section>

      {/* ─── Рельс городов маршрута ─── */}
      <div className="chip-rail chip-snap no-scrollbar pb-1 px-1">
        {cities.map((c) => {
          const entry = citiesWeather.get(c.key);
          const active = currentCity?.key === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelectedKey(c.key)}
              aria-label={`Погода: ${c.name}${!c.hasCoords ? " (нет координат)" : ""}`}
              aria-pressed={active}
              className={cn(
                "flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-2xl border p-2.5 transition-all active:scale-[0.97]",
                active ? "border-transparent text-white shadow-md" : "border-border bg-card hover:bg-accent"
              )}
              style={active ? { background: c.color } : undefined}
            >
              <span className="text-xl leading-none" aria-hidden>
                {entry?.data ? (
                  entry.data.emoji
                ) : c.hasCoords ? (
                  <span className="inline-block size-5 animate-pulse rounded-full bg-current opacity-20" />
                ) : (
                  "📍"
                )}
              </span>
              <span className="text-sm font-bold leading-none tabular-nums">
                {entry?.data ? (
                  `${entry.data.temperature}°`
                ) : c.hasCoords ? (
                  <span className="inline-block h-3 w-6 animate-pulse rounded bg-current opacity-15" />
                ) : (
                  "—"
                )}
              </span>
              <span className={cn("w-full truncate text-center text-[10px]", active ? "text-white/85" : "text-muted-foreground")}>
                {c.name}
                {!c.hasCoords && " ⚠"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Переключатель вида ─── */}
      <div className="flex rounded-full bg-muted p-1 text-xs font-medium" role="tablist" aria-label="Вид прогноза">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "route"}
          onClick={() => setView("route")}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 transition-all",
            activeView === "route" ? "bg-card shadow-sm" : "text-muted-foreground"
          )}
        >
          <RouteIcon className="size-3.5" /> По маршруту
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "city"}
          onClick={() => setView("city")}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 transition-all",
            activeView === "city" ? "bg-card shadow-sm" : "text-muted-foreground"
          )}
        >
          <CalendarDays className="size-3.5" /> 7 дней
        </button>
      </div>

      {/* ─── Прогноз: маршрут или город ─── */}
      {activeView === "route" ? (
        routeRows.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-3">
            <p className="mb-1 px-2 text-[11px] text-muted-foreground">
              Погода по дням поездки — прогноз города, запланированного на этот день. Нажмите на день, чтобы открыть его город.
            </p>
            <div className="divide-y divide-border/60">
              {routeRows.map((r) => (
                <button
                  key={r.day.id}
                  type="button"
                  onClick={() => {
                    if (r.city?.hasCoords) {
                      setSelectedKey(r.city.key);
                      setView("city");
                    } else {
                      setActiveTab("itinerary");
                    }
                  }}
                  aria-label={`День ${r.day.dayNumber}, ${r.day.city}: ${
                    r.fc ? `${r.fc.max}°, ${r.fc.label}` : "нет данных"
                  }. ${r.city?.hasCoords ? "Открыть прогноз города" : "Настроить город"}`}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors active:bg-accent/60"
                >
                  <div className="w-14 shrink-0">
                    <div className={cn("text-sm font-semibold", r.isToday && "text-sky-500")}>
                      {r.isToday ? "Сегодня" : weekdayOf(r.dateStr)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{dateLabel(r.dateStr)}</div>
                  </div>
                  <span className="w-8 shrink-0 text-center text-xl" aria-hidden>
                    {r.fc ? r.fc.emoji : "·"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      День {r.day.dayNumber} · {r.day.city}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {r.fc ? (
                        <>
                          {r.fc.label}
                          {(r.fc.precip ?? 0) >= 30 && <span className="ml-1 text-sky-500">· 🌧 {r.fc.precip}%</span>}
                        </>
                      ) : r.city?.hasCoords ? (
                        "вне 7-дневного прогноза"
                      ) : (
                        "нет координат города"
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    {r.fc ? (
                      <>
                        <span className="text-sm font-semibold">{r.fc.max}°</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{r.fc.min}°</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
            Ближайшая неделя не пересекается с днями маршрута. Посмотрите прогноз по городу на вкладке «7 дней».
          </div>
        )
      ) : weather?.forecast && weather.forecast.length > 0 && weekRange ? (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CloudRain className="size-4" /> Прогноз на 7 дней · {currentCity?.name}
          </h2>
          <div className="divide-y divide-border/60">
            {weather.forecast.map((day, i) => {
              const left = ((day.min - weekRange.min) / weekRange.span) * 100;
              const width = Math.max(8, ((day.max - day.min) / weekRange.span) * 100);
              return (
                <motion.div
                  key={day.date}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 py-2.5"
                >
                  <div className="w-16 shrink-0">
                    <div className={cn("text-sm font-medium", i === 0 && "text-sky-500")}>
                      {i === 0 ? "Сегодня" : i === 1 ? "Завтра" : weekdayOf(day.date)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{dateLabel(day.date)}</div>
                  </div>
                  <div className="w-8 shrink-0 text-center text-xl" aria-hidden>
                    {day.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-muted-foreground">
                      {day.label}
                      {(day.precip ?? 0) >= 30 && <span className="ml-1 text-sky-500">· 🌧 {day.precip}%</span>}
                    </div>
                    {/* Полоса диапазона температур недели */}
                    <div className="relative mt-1.5 h-1.5 rounded-full bg-muted">
                      <div
                        className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 to-orange-400"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                    <span className="text-sm font-semibold text-orange-500">{day.max}°</span>
                    <span className="text-xs text-muted-foreground">{day.min}°</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      ) : weather && !weather.fallback && activeView === "city" ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Прогноз на неделю недоступен для этого города
        </div>
      ) : null}

      {/* ─── Ближайшие 24 часа ─── */}
      {weather?.hours && weather.hours.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <Clock className="size-4 self-center text-sky-500" />
            <h2 className="text-sm font-semibold">Ближайшие 24 часа</h2>
            <span className="text-xs text-muted-foreground">время города</span>
          </div>
          <div className="chip-rail chip-snap no-scrollbar">
            {weather.hours.map((h, i) => (
              <div
                key={h.time}
                className="flex w-[54px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-2.5"
              >
                <span className={cn("text-[10px] leading-none", i === 0 ? "font-bold text-sky-500" : "text-muted-foreground")}>
                  {i === 0 ? "Сейчас" : h.time.slice(11, 16)}
                </span>
                <span className="text-lg leading-none" aria-hidden>
                  {h.emoji}
                </span>
                <span className="text-xs font-semibold leading-none tabular-nums">{h.temp}°</span>
                <span
                  className={cn(
                    "text-[10px] leading-none tabular-nums",
                    h.precip >= 30 ? "font-medium text-sky-500" : "text-muted-foreground opacity-40"
                  )}
                >
                  {h.precip}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Советы ─── */}
      {advices.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <Lightbulb className="size-4 self-center text-amber-500" />
            <h2 className="text-sm font-semibold">Что взять с собой</h2>
            <span className="text-xs text-muted-foreground">{currentCity?.name}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {advices.map((a) => (
              <div key={a} className="flex items-center rounded-2xl border border-border bg-card px-3 py-2 text-xs font-medium">
                {a}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Солнце и воздух ─── */}
      {weather && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <Sun className="size-4 self-center text-amber-500" />
            <h2 className="text-sm font-semibold">Солнце и воздух</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { emoji: "🌅", value: hm(weather.sunrise), label: "Восход" },
              { emoji: "🌇", value: hm(weather.sunset), label: "Закат" },
              { emoji: "☀️", value: weather.uv != null ? String(Math.round(weather.uv)) : "—", label: `UV · ${uvLabel(weather.uv)}` },
              { emoji: "💧", value: `${weather.humidity}%`, label: "Влажность" },
              { emoji: "💨", value: `${weather.wind} км/ч`, label: "Ветер" },
              {
                emoji: "🌧️",
                value: `${weather.forecast?.[0]?.precip ?? 0}%`,
                label: "Осадки сегодня",
              },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-3 text-center">
                <div className="text-base" aria-hidden>
                  {s.emoji}
                </div>
                <div className="mt-1 text-sm font-bold leading-none tabular-nums">{s.value}</div>
                <div className="mt-1 text-[10px] leading-tight text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Атрибуция (требование open-meteo) */}
      <p className="flex items-center justify-center gap-1 px-4 text-center text-[11px] text-muted-foreground">
        <MapPin className="size-3" /> Данные: open-meteo.com · обновление каждые 10 мин
      </p>
    </div>
  );
}
