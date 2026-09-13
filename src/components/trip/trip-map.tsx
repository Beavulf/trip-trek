"use client";

// CSS Leaflet едет вместе с этим чанком (а не глобальным render-blocking <link> в layout)
import "leaflet/dist/leaflet.css";
import { useDays, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { CATEGORY_META, type Place, type Day, type Photo } from "@/lib/types";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Pane } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  Scan,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { cn, plural } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { toast } from "sonner";
import { AddPlaceSheet, type AddPlaceData } from "./add-place-sheet";
import { PlaceDialog } from "./itinerary/PlaceDialog";
import { FiltersSheet, type MapFilters } from "./map/filters-sheet";
import { LayersSheet, type MapLayerKey } from "./map/layers-sheet";
import { isChillCategory } from "@/lib/chill-categories";
import { resolveCityCoords, decodeCustomKey } from "@/lib/city-coords";
import { timeSortRank } from "@/lib/time-of-day";

const TILE_LAYERS: Record<MapLayerKey, { url: string; attr: string }> = {
  voyager: {
    // CARTO с 2025 требует apikey — используем классический OSM
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri",
  },
  light: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri",
  },
  dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri",
  },
};

// Кэш иконок: makeIcon создаёт новый L.DivIcon на каждый вызов, а без кэша
// каждый ререндер карты (рефетч дней, фильтры) заменял DOM всех маркеров.
const pinIconCache = new Map<string, L.DivIcon>();
const photoIconCache = new Map<string, L.DivIcon>();

// Кастомный пин места
function makeIcon(category: string, status: string, emoji: string) {
  const cacheKey = `${category}|${status}|${emoji}`;
  const cached = pinIconCache.get(cacheKey);
  if (cached) return cached;
  let color = "#94a3b8"; // planned — серый
  if (status === "visited") color = "#22c55e";
  else if (status === "current") color = "#f97316";
  const pulse = status === "current" ? "trip-pin-current" : "";
  const icon = L.divIcon({
    className: `trip-pin ${pulse}`,
    html: `<div class="trip-pin-pin" style="background:${color}"><span>${emoji}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
  pinIconCache.set(cacheKey, icon);
  return icon;
}

// Фото-пин (круглая миниатюра) — безопасный HTML
function makePhotoIcon(thumbUrl: string) {
  const cached = photoIconCache.get(thumbUrl);
  if (cached) return cached;
  const safeUrl = thumbUrl.replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const icon = L.divIcon({
    className: "trip-photo-pin",
    html: `<div style="
      width:40px;height:40px;border-radius:50%;overflow:hidden;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
      background:#000;
    "><img src="${safeUrl}" style="width:100%;height:100%;object-fit:cover;" /></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
  photoIconCache.set(thumbUrl, icon);
  return icon;
}

// Точка геолокации
function makeLocateIcon() {
  return L.divIcon({
    className: "locate-dot",
    html: `<div class="locate-dot-core"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function TripMap() {
  const tripId = useCurrentTripId();
  const { data: days, isLoading, isError, refetch } = useDays();
  const {
    mapCityFilter,
    setMapCityFilter,
    mapOnlyUnvisited,
    setMapOnlyUnvisited,
    mapOnlyChill,
    setMapOnlyChill,
    mapFocusTarget,
    setMapFocusTarget,
    setTripSwitcherOpen,
    setActiveTab,
  } = useTripStore();

  const [addMode, setAddMode] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [autoTheme, setAutoTheme] = useState(true);
  const [manualLayer, setManualLayer] = useState<MapLayerKey>("voyager");
  const [showPhotos, setShowPhotos] = useState(true);
  const [onlyPhotos, setOnlyPhotos] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { resolvedTheme } = useTheme();
  const mapRef = useRef<L.Map | null>(null);
  // Колесо мыши зумит только на десктопе (на мобильном колесо нет, а страница не должна скроллиться «в карту»)
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 641px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Фото с геолокацией (только текущая поездка)
  const { data: geoPhotos } = useQuery<Photo[]>({
    queryKey: ["photos-geo", tripId],
    queryFn: async () => {
      if (!tripId) return [];
      const r = await fetch(`/api/photos/geo?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch photos-geo failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tripId,
  });

  const { data: tripMeta } = useTrip();

  // Автоматический выбор слоя по теме
  const tileLayer: MapLayerKey = autoTheme
    ? resolvedTheme === "dark" ? "dark" : "voyager"
    : manualLayer;

  const allPlaces = useMemo(() => {
    if (!days) return [] as { place: Place; day: Day }[];
    return days.flatMap((d) => d.places.map((p) => ({ place: p, day: d })));
  }, [days]);

  const filtered = useMemo(() => {
    let res = allPlaces;
    if (mapCityFilter) res = res.filter((x) => x.day.cityKey === mapCityFilter);
    if (mapOnlyUnvisited) res = res.filter((x) => x.place.status !== "visited");
    if (mapOnlyChill) res = res.filter((x) => isChillCategory(x.place.category));
    return res;
  }, [allPlaces, mapCityFilter, mapOnlyUnvisited, mapOnlyChill]);

  const cities = useMemo(() => {
    if (!days) return [];
    const seen = new Map<string, { cityKey: string; city: string; accentColor: string; count: number }>();
    for (const d of days) {
      if (!seen.has(d.cityKey)) {
        seen.set(d.cityKey, {
          cityKey: d.cityKey,
          city: d.city,
          accentColor: d.accentColor ?? "#f97316",
          count: 0,
        });
      }
    }
    for (const { place, day } of allPlaces) {
      const c = seen.get(day.cityKey);
      if (c) c.count += 1;
    }
    return [...seen.values()];
  }, [days, allPlaces]);

  const visitedCount = useMemo(
    () => allPlaces.filter((x) => x.place.status === "visited").length,
    [allPlaces]
  );
  const photoCount = geoPhotos?.length ?? 0;

  const activeFilterCount =
    (mapCityFilter ? 1 : 0) +
    (mapOnlyUnvisited ? 1 : 0) +
    (mapOnlyChill ? 1 : 0) +
    (onlyPhotos ? 1 : 0) +
    (showPhotos ? 0 : 1);

  const filters: MapFilters = {
    cityFilter: mapCityFilter,
    onlyUnvisited: mapOnlyUnvisited,
    onlyChill: mapOnlyChill,
    showPhotos,
    onlyPhotos,
  };

  const onFiltersChange = (patch: Partial<MapFilters>) => {
    if ("cityFilter" in patch) setMapCityFilter(patch.cityFilter ?? null);
    if ("onlyUnvisited" in patch) setMapOnlyUnvisited(!!patch.onlyUnvisited);
    if ("onlyChill" in patch) setMapOnlyChill(!!patch.onlyChill);
    if ("showPhotos" in patch) setShowPhotos(!!patch.showPhotos);
    if ("onlyPhotos" in patch) setOnlyPhotos(!!patch.onlyPhotos);
  };

  const isChinaTrip = /china|китай|guangzhou|shenzhen|hongkong|macau|гуанчжоу|шэньчжэнь|гонконг|макао/i.test(
    `${tripMeta?.trip?.destination ?? ""} ${tripMeta?.settings?.title ?? ""} ${(days || []).map((d) => d.city).join(" ")}`
  );
  const mapNote = isChinaTrip
    ? "В Китае OpenStreetMap может грузиться медленно без VPN. Для навигации на месте удобнее приложение Amap (高德地图) или Baidu Maps."
    : "Метки хранятся в поездке и видны всем участникам.";

  // Центр при первом монтировании: город фильтра / первое место / первый день
  const initialCenter = useMemo(() => {
    if (mapCityFilter) {
      const c = resolveCityCoords(mapCityFilter) ?? decodeCustomKey(mapCityFilter);
      if (c) return { lat: c.lat, lng: c.lng };
    }
    if (allPlaces.length > 0) return { lat: allPlaces[0].place.lat, lng: allPlaces[0].place.lng };
    if (days && days.length > 0) {
      const d = days[0];
      const c = resolveCityCoords(d.cityKey) ?? decodeCustomKey(d.cityKey);
      if (c) return { lat: c.lat, lng: c.lng };
      const place = d.places?.find((p) => p.lat && p.lng);
      if (place) return { lat: place.lat, lng: place.lng };
    }
    return { lat: 20, lng: 0 };
  }, []);

  // Подгонка вида при смене города
  const cityFocus = useMemo(() => {
    if (!mapCityFilter) return null;
    const pts = allPlaces
      .filter((x) => x.day.cityKey === mapCityFilter)
      .map((x) => ({ lat: x.place.lat, lng: x.place.lng }));
    const c = resolveCityCoords(mapCityFilter) ?? decodeCustomKey(mapCityFilter);
    return { pts, fallback: c ? { lat: c.lat, lng: c.lng } : null };
  }, [mapCityFilter, allPlaces]);

  // Все полёты делаем из родителя через mapRef: эффекты внутри MapContainer
  // срабатывают до расчёта размера контейнера и flyTo молча не происходит.
  // Ретраи: карта может монтироваться дольше задержки (динамический импорт,
  // спиннер загрузки) — одиночный таймаут молча терял полёт.
  const flyWhenReady = (fn: (map: L.Map) => void, delay = 250) => {
    const attempt = (left: number) => {
      const m = mapRef.current;
      if (m) {
        fn(m);
        return;
      }
      if (left <= 0) return;
      setTimeout(() => attempt(left - 1), 100);
    };
    const t = setTimeout(() => attempt(20), delay);
    return t;
  };

  // Стартовый вид: подгоняем под весь маршрут, как только пришли дни
  // (первый рендер компонента происходит ещё на спиннере загрузки).
  // Без cleanup у таймаута: повторный рендер (новая identity mountPts)
  // не должен отменять уже запланированный полёт.
  const fittedOnce = useRef(false);
  const mountPts = mapCityFilter
    ? []
    : allPlaces.map((x) => ({ lat: x.place.lat, lng: x.place.lng }));
  useEffect(() => {
    if (fittedOnce.current || mountPts.length === 0) return;
    fittedOnce.current = true;
    flyWhenReady((m) => {
      const bounds = L.latLngBounds(mountPts.map((p) => [p.lat, p.lng] as [number, number]));
      // fitBounds, а не flyToBounds: анимированный полёт сразу после
      // инициализации карты молча не срабатывает, мгновенный setView — надёжный
      m.fitBounds(bounds, { padding: [40, 40], animate: false });
    }, 300);
  }, [mountPts]);

  // Смена города — подгоняем вид на его места
  const lastCity = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastCity.current === mapCityFilter) return;
    lastCity.current = mapCityFilter;
    if (!mapCityFilter || !cityFocus) return;
    flyWhenReady((m) => {
      if (cityFocus.pts.length === 0) {
        if (cityFocus.fallback) m.flyTo([cityFocus.fallback.lat, cityFocus.fallback.lng], 12, { duration: 0.8 });
        return;
      }
      flyToPts(m, cityFocus.pts, 13);
    });
  }, [mapCityFilter, cityFocus]);

  // Фокус из других вкладок (галерея, диалог места).
  // Задержка больше старта монтирования (fitBounds на 300мс, мгновенный):
  // фокусный полёт должен прийти последним и оставить вид на цели.
  useEffect(() => {
    if (!mapFocusTarget) return;
    // Если передано место — ведём себя как тап по маркеру: перелёт + карточка
    const targetPlace = mapFocusTarget.placeId
      ? allPlaces.find((x) => x.place.id === mapFocusTarget.placeId)?.place
      : undefined;
    if (targetPlace) {
      flyWhenReady((m) => {
        setSelectedPlace(targetPlace);
        m.flyTo([targetPlace.lat, targetPlace.lng], Math.max(m.getZoom(), 15), { duration: 0.7 });
      }, 450);
    } else {
      flyWhenReady((m) => {
        m.flyTo([mapFocusTarget.lat, mapFocusTarget.lng], Math.max(m.getZoom(), 16), { duration: 1 });
      }, 450);
    }
  }, [mapFocusTarget]);

  // Под consume сигнала «показать это место» из галереи/диалога места
  useEffect(() => {
    if (!mapFocusTarget) return;
    const t = setTimeout(() => setMapFocusTarget(null), 50);
    return () => clearTimeout(t);
  }, [mapFocusTarget, setMapFocusTarget]);

  // Полноэкранный режим: Leaflet не знает, что контейнер изменился —
  // пересчитываем размер после css-перехода, иначе тайлы не дорастянутся.
  // Шапку и FAB прячем классом на body: обёртка вкладки от framer-motion
  // создаёт stacking context, внутри которого любой z-index ниже шапки.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t1 = setTimeout(() => map.invalidateSize(), 80);
    const t2 = setTimeout(() => map.invalidateSize(), 420);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fullscreen]);

  // Пока карту тащат — замирают «постоянные» анимации (пульс пинов, бегущий
  // пунктир, пульс геоточки): их repaint каждый кадр складывается с
  // перерисовкой тайлов и даёт лаги перетаскивания на телефонах.
  // ref появляется асинхронно (и карта может монтироваться после спиннера
  // загрузки) — ждём его с повторными попытками.
  useEffect(() => {
    let tries = 0;
    const iv = setInterval(() => {
      const map = mapRef.current;
      if (map) {
        clearInterval(iv);
        const el = map.getContainer();
        map.on("movestart", () => el.classList.add("map-anim-paused"));
        map.on("moveend", () => el.classList.remove("map-anim-paused"));
      } else if (++tries > 40) {
        clearInterval(iv);
      }
    }, 250);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    document.body.classList.add("map-fs");
    return () => document.body.classList.remove("map-fs");
  }, [fullscreen]);

  // Esc сворачивает полноэкранную карту
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Пустые состояния
  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🗺️</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Выбери поездку, чтобы открыть карту</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить карту</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (!isLoading && (!days || days.length === 0)) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🗺️</div>
          <h1 className="text-xl font-bold">Карта пуста</h1>
          <p className="text-white/80 text-sm mt-1">
            Добавьте дни в маршрут, чтобы увидеть места на карте
          </p>
          <button
            type="button"
            onClick={() => setActiveTab("itinerary")}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            К маршруту →
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Загрузка карты…</div>;

  // ---- Действия ----

  const openPlace = (place: Place) => {
    setSelectedPlace(place);
    const map = mapRef.current;
    if (map) map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 15), { duration: 0.7 });
  };

  // Вид сам подгонится под город в эффекте на mapCityFilter
  const pickCity = (cityKey: string | null) => setMapCityFilter(cityKey);

  // «Показать весь маршрут» — вся поездка целиком, независимо от фильтров
  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    // сразу после выхода из полного экрана размер мог измениться,
    // а fitBounds считает его сам — пересчитываем принудительно
    map.invalidateSize();
    const pts = [
      ...allPlaces.map((x) => ({ lat: x.place.lat, lng: x.place.lng })),
      ...(showPhotos && geoPhotos
        ? geoPhotos.filter((p) => p.lat != null && p.lng != null).map((p) => ({ lat: p.lat!, lng: p.lng! }))
        : []),
    ];
    if (pts.length === 0) {
      toast.info("На карте пока нет меток");
      return;
    }
    // мгновенно: анимированный полёт здесь избыточен и капризен
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], Math.max(map.getZoom(), 12), { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), {
      padding: [48, 48],
      animate: false,
    });
  };

  // Кнопки +/− : мгновенный шаг зума
  const zoomBy = (d: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom(map.getZoom() + d, { animate: false });
  };

  const locate = () => {
    if (locating) return;
    if (!navigator.geolocation) {
      toast.error("Геолокация недоступна на этом устройстве");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLoc(p);
        setLocating(false);
        mapRef.current?.flyTo([p.lat, p.lng], Math.max(mapRef.current?.getZoom() ?? 13, 15), { duration: 0.9 });
      },
      () => {
        setLocating(false);
        toast.error("Не удалось определить местоположение", {
          description: "Проверьте, что браузеру разрешён доступ к геопозиции",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const startAddMode = () => setAddMode(true);

  const confirmAdd = () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const dayForPlace = mapCityFilter
      ? days?.find((d) => d.cityKey === mapCityFilter)?.id
      : undefined;
    setAddData({ lat: c.lat, lng: c.lng, dayId: dayForPlace });
    setAddOpen(true);
    setAddMode(false);
  };

  const visiblePlaces = onlyPhotos ? [] : filtered;
  const visiblePhotos = showPhotos
    ? (geoPhotos ?? []).filter((p) => p.lat != null && p.lng != null)
    : [];

  return (
    // Без animate-fade-up на корне: его animation-fill:both оставляет
    // transform на предке и ломает position:fixed у полноэкранного режима
    <div className="-mx-3 sm:mx-0">
      {/* Карта-герой: почти весь экран, управление плавает поверх */}
      <div
        className={cn(
          "overflow-hidden transition-shadow",
          fullscreen
            ? "fixed inset-0 z-[130] rounded-none border-0 bg-background"
            : cn(
                "relative rounded-3xl border shadow-lg h-[calc(100dvh-16.5rem)] min-h-[420px] sm:h-[calc(100dvh-14rem)] sm:max-h-[720px]",
                addMode ? "border-primary ring-2 ring-primary/40" : "border-border"
              )
        )}
      >
        <MapContainer
          ref={mapRef}
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={mapCityFilter ? 12 : 8}
          scrollWheelZoom={isDesktop}
          zoomControl={false}
          className="w-full h-full bg-muted"
        >
          <TileLayer
            key={tileLayer}
            attribution={TILE_LAYERS[tileLayer].attr}
            url={TILE_LAYERS[tileLayer].url}
            keepBuffer={4}
          />

          {/* Нити маршрута по дням */}
          {!onlyPhotos && (
            <RouteThreads places={filtered} currentDayNumber={tripMeta?.currentDayNumber} />
          )}

          {/* Места */}
          {visiblePlaces.map(({ place }) => (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={makeIcon(place.category, place.status, CATEGORY_META[place.category]?.emoji ?? "📍")}
              zIndexOffset={place.status === "current" ? 1000 : 0}
              eventHandlers={{ click: () => openPlace(place) }}
            />
          ))}

          {/* Геолокация */}
          {myLoc && (
            <>
              <CircleMarker
                center={[myLoc.lat, myLoc.lng]}
                radius={22}
                pathOptions={{ color: "#3b82f6", weight: 1, fillColor: "#3b82f6", fillOpacity: 0.12 }}
              />
              <Marker position={[myLoc.lat, myLoc.lng]} icon={makeLocateIcon()} zIndexOffset={900} />
            </>
          )}

          {/* Фото-метки */}
          {visiblePhotos.map((photo) => (
            <Marker
              key={`photo-${photo.id}`}
              position={[photo.lat!, photo.lng!]}
              icon={makePhotoIcon(photo.thumbUrl || photo.url)}
            >
              <Popup>
                <PhotoPopupContent photo={photo} onOpenFullscreen={() => setFullscreenPhoto(photo)} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Верхняя плавающая строка: города + фильтры */}
        {!addMode && (
          <div className="absolute top-2 inset-x-2 z-[600] flex items-start gap-1.5 pointer-events-none">
            <div className="chip-rail no-scrollbar flex-1 min-w-0 py-0.5 pointer-events-auto">
              <CityChip active={mapCityFilter === null} onClick={() => pickCity(null)}>
                Весь маршрут
              </CityChip>
              {cities.map((c) => (
                <CityChip
                  key={c.cityKey}
                  active={mapCityFilter === c.cityKey}
                  accent={c.accentColor}
                  onClick={() => pickCity(c.cityKey)}
                >
                  {c.city}
                  <span
                    className={cn(
                      "text-[10px] font-bold ml-0.5",
                      mapCityFilter === c.cityKey ? "text-white/70" : "text-muted-foreground"
                    )}
                  >
                    {c.count}
                  </span>
                </CityChip>
              ))}
            </div>
            <MapFab
              label="Фильтры"
              onClick={() => setFiltersOpen(true)}
              badge={activeFilterCount > 0 ? activeFilterCount : undefined}
              className="pointer-events-auto shrink-0"
            >
              <SlidersHorizontal className="size-4.5" />
            </MapFab>
          </div>
        )}

        {/* Правая колонка: зум / слои / геолокация / полный экран / весь маршрут / добавить */}
        {!addMode && (
          <div className="absolute right-2 top-[3.75rem] z-[600] flex flex-col gap-1.5">
            <MapFab label="Приблизить" onClick={() => zoomBy(1)} desktopOnly>
              <ZoomIn className="size-4.5" />
            </MapFab>
            <MapFab label="Отдалить" onClick={() => zoomBy(-1)} desktopOnly>
              <ZoomOut className="size-4.5" />
            </MapFab>
            <MapFab label="Стиль карты" onClick={() => setLayersOpen(true)}>
              <Layers className="size-4.5" />
            </MapFab>
            <MapFab label="Где я" onClick={locate} busy={locating}>
              {locating ? <Loader2 className="size-4.5 animate-spin" /> : <LocateFixed className={cn("size-4.5", myLoc && "text-blue-500")} />}
            </MapFab>
            <MapFab
              label={fullscreen ? "Свернуть карту" : "Во весь экран"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? <Minimize2 className="size-4.5" /> : <Maximize2 className="size-4.5" />}
            </MapFab>
            <MapFab label="Показать весь маршрут" onClick={fitAll}>
              <Scan className="size-4.5" />
            </MapFab>
            <MapFab label="Добавить место" onClick={startAddMode} primary>
              <Plus className="size-5" strokeWidth={2.5} />
            </MapFab>
          </div>
        )}

        {/* Прицел режима добавления */}
        {addMode && (
          <>
            <div className="absolute inset-0 z-[550] pointer-events-none grid place-items-center">
              <div className="relative size-16">
                <span className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-primary/60" />
                <span className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-primary/60" />
                <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-white/70 shadow-md" />
              </div>
            </div>
            {/* Без backdrop-blur поверх карты: на телефонах пересчёт блюра
                движущейся подложки каждый кадр — главный источник лагов drag */}
            <div className="absolute top-[3.75rem] left-1/2 -translate-x-1/2 z-[600] bg-card/90 text-foreground text-xs font-medium px-3 py-2 rounded-full shadow-lg border border-border whitespace-nowrap">
              Перетащите карту — точка в прицеле
            </div>
            <div className="absolute bottom-3 inset-x-3 z-[650] flex gap-2">
              <button
                type="button"
                onClick={() => setAddMode(false)}
                className="min-h-12 px-4 rounded-xl bg-card/90 border border-border text-sm font-medium grid place-items-center"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmAdd}
                className="flex-1 min-h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
              >
                <Plus className="size-4" strokeWidth={3} />
                Добавить здесь
              </button>
            </div>
          </>
        )}

        {/* Рельса мест внизу */}
        {!addMode && (
          <div className="absolute bottom-2 left-2 right-2 z-[600] rounded-2xl bg-card/90 border border-border shadow-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setRailCollapsed((v) => !v)}
              aria-expanded={!railCollapsed}
              className="w-full flex items-center gap-2 px-3 min-h-10 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <MapPin className="size-3.5 text-primary" />
              <span>
                {filtered.length} {plural(filtered.length, "место", "места", "мест")}
                {visitedCount > 0 && allPlaces.length > 0 && (
                  <span className="text-green-600 font-semibold"> · {visitedCount} ✓</span>
                )}
              </span>
              {railCollapsed ? <ChevronUp className="size-4 ml-auto" /> : <ChevronDown className="size-4 ml-auto" />}
            </button>
            {!railCollapsed && filtered.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-2 pb-2">
                {filtered.map(({ place, day }) => {
                  const meta = CATEGORY_META[place.category];
                  const visited = place.status === "visited";
                  return (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => openPlace(place)}
                      className="shrink-0 w-36 rounded-xl bg-card border border-border p-2 text-left active:scale-95 transition-transform hover:border-primary/40"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-7 rounded-lg grid place-items-center text-sm shrink-0"
                          style={{ background: `${meta?.color}22` }}
                          aria-hidden="true"
                        >
                          {meta?.emoji}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium truncate">
                          День {day.dayNumber} · {day.city}
                        </span>
                        {visited && <CheckCircle2 className="size-3.5 text-green-500 ml-auto shrink-0" />}
                      </span>
                      <span className="block text-xs font-medium truncate mt-1">{place.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Пусто после фильтров */}
        {!addMode && !onlyPhotos && filtered.length === 0 && allPlaces.length > 0 && (
          <div className="absolute inset-0 z-[560] grid place-items-center pointer-events-none px-6">
            <div className="pointer-events-auto rounded-2xl bg-card/95 border border-border shadow-xl px-4 py-4 text-center max-w-[250px]">
              <div className="text-2xl">🔍</div>
              <p className="text-sm font-semibold mt-1">Ничего не найдено</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Под текущие фильтры не подходит ни одно место
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onFiltersChange({ cityFilter: null, onlyUnvisited: false, onlyChill: false, onlyPhotos: false, showPhotos: true })
                  }
                  className="mt-2.5 w-full min-h-10 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Строка итогов под картой */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1 pt-2 flex-wrap">
        {allPlaces.length > 0 && (
          <span>
            Посещено {visitedCount} из {allPlaces.length}
          </span>
        )}
        {photoCount > 0 && (
          <span>
            · {photoCount} {plural(photoCount, "фото", "фото", "фото")} на карте
          </span>
        )}
        <span className="ml-auto opacity-70">OpenStreetMap · Esri</span>
      </div>

      <AddPlaceSheet open={addOpen} onOpenChange={setAddOpen} initial={addData} />

      <PlaceDialog
        place={selectedPlace}
        currency={currencySymbol(tripMeta?.settings.currency)}
        onClose={() => setSelectedPlace(null)}
      />

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        cities={cities}
        filters={filters}
        onChange={onFiltersChange}
        photoCount={photoCount}
        placeCount={allPlaces.length}
        visitedCount={visitedCount}
        note={mapNote}
      />

      <LayersSheet
        open={layersOpen}
        onOpenChange={setLayersOpen}
        autoTheme={autoTheme}
        onAutoTheme={setAutoTheme}
        manualLayer={manualLayer}
        onManualLayer={(l) => {
          setManualLayer(l);
          setAutoTheme(false);
        }}
        activeLayer={tileLayer}
        isDarkTheme={resolvedTheme === "dark"}
        note={mapNote}
      />

      {/* Полноэкранный просмотр фото */}
      {fullscreenPhoto && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 size-11 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 z-10"
            onClick={() => setFullscreenPhoto(null)}
            aria-label="Закрыть"
          >
            <X className="size-5" />
          </button>
          <img
            src={fullscreenPhoto.url}
            alt={fullscreenPhoto.caption || ""}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-4 text-center max-w-md">
            {fullscreenPhoto.caption && <div className="text-white font-medium text-sm">{fullscreenPhoto.caption}</div>}
            {fullscreenPhoto.address && (
              <div className="text-white/60 text-xs mt-1 flex items-center justify-center gap-1">
                <MapPin className="size-3" /> {fullscreenPhoto.address}
              </div>
            )}
            <div className="text-white/50 text-xs mt-1">
              {fullscreenPhoto.user?.emoji} {fullscreenPhoto.user?.name} · День {fullscreenPhoto.day?.dayNumber}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ---- Вспомогательные ----

function flyToPts(map: L.Map, pts: { lat: number; lng: number }[], minZoom: number) {
  if (pts.length === 0) return;
  if (pts.length === 1) {
    map.flyTo([pts[0].lat, pts[0].lng], Math.max(map.getZoom(), minZoom), { duration: 0.8 });
    return;
  }
  map.flyToBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), {
    duration: 0.8,
    padding: [48, 48],
  });
}

/** Плавающая круглая кнопка на карте */
function MapFab({
  children,
  label,
  onClick,
  primary,
  badge,
  busy,
  className,
  desktopOnly,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  badge?: number;
  busy?: boolean;
  className?: string;
  /** Скрыть на мобильных (там есть pinch-zoom) */
  desktopOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "relative size-11 rounded-full grid place-items-center shadow-lg border transition-all active:scale-90",
        primary
          ? "bg-primary text-primary-foreground border-primary/50 shadow-primary/30"
          : "bg-card/90 text-foreground border-border hover:bg-accent",
        desktopOnly && "max-sm:hidden",
        className
      )}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center border-2 border-card">
          {badge}
        </span>
      )}
    </button>
  );
}

function CityChip({
  children,
  active,
  accent,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center min-h-11 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors shadow-sm border",
        active ? "text-white border-transparent" : "bg-card/90 border-border text-foreground hover:bg-accent"
      )}
      style={active ? { background: accent ?? "#f97316" } : undefined}
    >
      {children}
    </button>
  );
}

/** Фото в попапе фото-метки */
function PhotoPopupContent({ photo, onOpenFullscreen }: { photo: Photo; onOpenFullscreen: () => void }) {
  return (
    <div className="p-1 w-48">
      <img src={photo.url} alt={photo.caption || ""} className="w-full h-32 object-cover rounded-lg mb-1.5" />
      {photo.caption && <div className="text-xs font-medium">{photo.caption}</div>}
      {photo.address && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
          <MapPin className="size-2.5" /> {photo.address.slice(0, 50)}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {photo.user?.emoji} {photo.user?.name} · День {photo.day?.dayNumber}
      </div>
      <button
        type="button"
        onClick={onOpenFullscreen}
        className="mt-1.5 w-full text-[10px] font-medium bg-primary/10 text-primary rounded-lg py-1.5 hover:bg-primary/20 transition-colors"
      >
        📷 На весь экран
      </button>
    </div>
  );
}

/**
 * Нити маршрута: полилинии между местами дня в цвете дня.
 * Сплошная линия — оба места посещены, пунктир — впереди.
 * Сегменты сегодняшнего дня рендерим в отдельной панели — её пунктир
 * «бежит» (CSS .leaflet-pane-route-today), className у path в setStyle
 * не попадает, поэтому панель вместо класса.
 */
function RouteThreads({
  places,
  currentDayNumber,
}: {
  places: { place: Place; day: Day }[];
  currentDayNumber?: number;
}) {
  const byDay = useMemo(() => {
    const m = new Map<string, { day: Day; pts: Place[] }>();
    for (const { place, day } of places) {
      if (!m.has(day.id)) m.set(day.id, { day, pts: [] });
      m.get(day.id)!.pts.push(place);
    }
    return [...m.values()];
  }, [places]);

  const others: ReactNode[] = [];
  const today: ReactNode[] = [];

  byDay.forEach(({ day, pts }) => {
    // Порядок обхода: время суток, затем исходный порядок списка
    const sorted = pts
      .map((p, i) => ({ p, i, r: timeSortRank(p.timeOfDay) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.p);
    const isToday = day.dayNumber === currentDayNumber;
    const color = day.accentColor ?? "#f97316";
    sorted.slice(0, -1).forEach((a, i) => {
      const b = sorted[i + 1];
      const done = a.status === "visited" && b.status === "visited";
      const segment = (
        <Polyline
          key={`${a.id}-${b.id}`}
          positions={[
            [a.lat, a.lng],
            [b.lat, b.lng],
          ]}
          pathOptions={{
            color,
            weight: isToday ? 4 : 2.5,
            opacity: isToday ? 0.85 : 0.55,
            dashArray: done ? undefined : "5 9",
            lineCap: "round",
            interactive: false,
          }}
        />
      );
      (isToday ? today : others).push(segment);
    });
  });

  return (
    <>
      {others}
      {today.length > 0 && <Pane name="route-today">{today}</Pane>}
    </>
  );
}
