"use client";

// CSS Leaflet едет вместе с этим чанком (а не глобальным render-blocking <link> в layout)
import "leaflet/dist/leaflet.css";
import { useRoute, useCurrentTripId } from "@/hooks/use-trip";
import { usePhotosGeo } from "@/hooks/trip/use-photos";
import { useTripStore } from "@/lib/trip-store";
import { CATEGORY_META, type Place, type Day, type Photo } from "@/lib/types";
import { Marker, Popup, CircleMarker } from "react-leaflet";
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
import { createPortal } from "react-dom";
import { cn, plural } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { buildRouteCities, buildRoutePlaces, countVisited } from "@/lib/route";
import { toast } from "sonner";
import { AddPlaceSheet, type AddPlaceData } from "./add-place-sheet";
import { PlaceDialog } from "./itinerary/PlaceDialog";
import { FiltersSheet } from "./map/filters-sheet";
import { useMapFilters } from "@/hooks/trip/use-map-filters";
import { LayersSheet, type MapLayerKey } from "./map/layers-sheet";
import { isChillCategory } from "@/lib/chill-categories";
import { resolveCityCoords, decodeCustomKey } from "@/lib/city-coords";
import { peekMapFocus, ackMapFocus, subscribeMapFocus } from "@/lib/map-bus";
import { RouteThreads } from "./map/route-threads";
import { MapCanvas, type MapCanvasHandle } from "./map/canvas";
import { makeIcon, makePhotoIcon, makeLocateIcon } from "./map/icons";
import { EmptyHero } from "./empty-hero";

export default function TripMap({ active = true }: { active?: boolean }) {
  const tripId = useCurrentTripId();
  // Модель чтения маршрута: дни+места+мета одним запросом (вместо useDays + useTrip)
  const { data: route, isLoading, isError, refetch } = useRoute();
  const days = route?.days;
  const { data: geoPhotos } = usePhotosGeo();
  const {
    filters,
    patchFilters,
    setCityFilter,
    resetFilters,
    activeCount: activeFilterCount,
  } = useMapFilters();
  const mapCityFilter = filters.cityFilter;
  const { setTripSwitcherOpen, setActiveTab } = useTripStore();

  const [addMode, setAddMode] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [autoTheme, setAutoTheme] = useState(true);
  const [manualLayer, setManualLayer] = useState<MapLayerKey>("voyager");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { resolvedTheme } = useTheme();
  const canvasRef = useRef<MapCanvasHandle>(null);
  // Колесо мыши зумит только на десктопе (на мобильном колесо нет, а страница не должна скроллиться «в карту»)
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 641px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Автоматический выбор слоя по теме
  const tileLayer: MapLayerKey = autoTheme
    ? resolvedTheme === "dark" ? "dark" : "voyager"
    : manualLayer;

  const allPlaces = useMemo(
    () => buildRoutePlaces(days ?? []),
    [days]
  );

  const filtered = useMemo(() => {
    let res = allPlaces;
    if (filters.cityFilter) res = res.filter((x) => x.day.cityKey === filters.cityFilter);
    if (filters.onlyUnvisited) res = res.filter((x) => x.place.status !== "visited");
    if (filters.onlyChill) res = res.filter((x) => isChillCategory(x.place.category));
    return res;
  }, [allPlaces, filters]);

  const cities = useMemo(
    () => buildRouteCities(days ?? [], allPlaces),
    [days, allPlaces]
  );

  const visitedCount = useMemo(
    () => countVisited(allPlaces),
    [allPlaces]
  );
  const photoCount = geoPhotos?.length ?? 0;

  const isChinaTrip = /china|китай|guangzhou|shenzhen|hongkong|macau|гуанчжоу|шэньчжэнь|гонконг|макао/i.test(
    `${route?.meta.destination ?? ""} ${route?.meta.title ?? ""} ${(days || []).map((d) => d.city).join(" ")}`
  );
  const mapNote = isChinaTrip
    ? "В Китае OpenStreetMap может грузиться медленно без VPN. Для навигации на месте удобнее приложение Amap (高德地图) или Baidu Maps."
    : "Метки хранятся в поездке и видны всем участникам.";

  // Центр при первом монтировании: город фильтра / первое место / первый день.
  // Считается на каждый рендер (дёшево) без memo: MapContainer читает center
  // только при создании инстанса, дальнейшие значения ни на что не влияют.
  const initialCenter = (() => {
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
  })();

  // Подгонка вида при смене города
  const cityFocus = useMemo(() => {
    if (!mapCityFilter) return null;
    const pts = allPlaces
      .filter((x) => x.day.cityKey === mapCityFilter)
      .map((x) => ({ lat: x.place.lat, lng: x.place.lng }));
    const c = resolveCityCoords(mapCityFilter) ?? decodeCustomKey(mapCityFilter);
    return { pts, fallback: c ? { lat: c.lat, lng: c.lng } : null };
  }, [mapCityFilter, allPlaces]);

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
    canvasRef.current?.fitPoints(mountPts, { padding: [40, 40] });
  }, [mountPts]);

  // Смена города — подгоняем вид на его места
  const lastCity = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastCity.current === mapCityFilter) return;
    lastCity.current = mapCityFilter;
    if (!mapCityFilter || !cityFocus) return;
    if (cityFocus.pts.length === 0) {
      if (cityFocus.fallback) canvasRef.current?.focusOn(cityFocus.fallback, { zoomBoost: 12, duration: 0.8 });
      return;
    }
    canvasRef.current?.flyToPoints(cityFocus.pts, 13);
  }, [mapCityFilter, cityFocus]);

  // Фокус из других вкладок (галерея, лента, диалог места) — шина map-bus.
  // Цель ждёт в шине до монтирования карты и потребляется ровно один раз (ack сразу,
  // полёт планирует flyWhenReady). Задержка 450 — позже mount-fitBounds (300, мгновенный):
  // фокусный полёт приходит последним и оставляет вид на цели.
  // Цель может прийти раньше канваса (спиннер) — доставку повторяем, пока не ack
  useEffect(() => {
    const deliver = () => {
      const req = peekMapFocus();
      if (!req) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      ackMapFocus(req);
      // Если передано место — ведём себя как тап по маркеру: перелёт + карточка
      const targetPlace = req.placeId
        ? allPlaces.find((x) => x.place.id === req.placeId)?.place
        : undefined;
      if (targetPlace) setSelectedPlace(targetPlace);
      canvas.focusOn(
        targetPlace ? { lat: targetPlace.lat, lng: targetPlace.lng } : { lat: req.lat, lng: req.lng },
        targetPlace ? { zoomBoost: 15, duration: 0.7 } : { zoomBoost: 16, duration: 1 }
      );
    };
    const unsub = subscribeMapFocus(deliver);
    const iv = setInterval(deliver, 300);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, [allPlaces]);

  // Фото-метки — самая дорогая часть монтирования (каждая — маркер с <img>,
  // их может быть сотни). На первое открытие вкладки откладываем их до простоя:
  // тайлы и пины мест становятся интерактивными сразу, фото дорисовываются следом.
  const [photosReady, setPhotosReady] = useState(false);
  useEffect(() => {
    if (photosReady) return;
    const warm = () => setPhotosReady(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(warm, 800);
    return () => clearTimeout(t);
  }, [photosReady]);

  // Шапку и FAB прячем классом на body: обёртка вкладки от framer-motion
  // создаёт stacking context, внутри которого любой z-index ниже шапки.
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
      <EmptyHero
        emoji="🗺️"
        title="Нет активной поездки"
        text="Выбери поездку, чтобы открыть карту"
        actionLabel="Мои поездки →"
        onAction={() => setTripSwitcherOpen(true)}
      />
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
      <EmptyHero
        emoji="🗺️"
        title="Карта пуста"
        text="Добавьте дни в маршрут, чтобы увидеть места на карте"
        actionLabel="К маршруту →"
        onAction={() => setActiveTab("itinerary")}
      />
    );
  }

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Загрузка карты…</div>;

  // ---- Действия ----

  const openPlace = (place: Place) => {
    setSelectedPlace(place);
    canvasRef.current?.focusOn({ lat: place.lat, lng: place.lng }, { zoomBoost: 15, duration: 0.7 });
  };

  // Вид сам подгонится под город в эффекте на mapCityFilter
  const pickCity = setCityFilter;

  // «Показать весь маршрут» — вся поездка целиком, независимо от фильтров
  const fitAll = () => {
    const pts = [
      ...allPlaces.map((x) => ({ lat: x.place.lat, lng: x.place.lng })),
      ...(filters.showPhotos && geoPhotos
        ? geoPhotos.filter((p) => p.lat != null && p.lng != null).map((p) => ({ lat: p.lat!, lng: p.lng! }))
        : []),
    ];
    if (pts.length === 0) {
      toast.info("На карте пока нет меток");
      return;
    }
    canvasRef.current?.fitPoints(pts);
  };

  // Кнопки +/− : мгновенный шаг зума
  const zoomBy = (d: number) => canvasRef.current?.zoomBy(d);

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
        canvasRef.current?.focusOn(p, { zoomBoost: 15, duration: 0.9 });
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
    const c = canvasRef.current?.getCenter();
    if (!c) return;
    const dayForPlace = mapCityFilter
      ? days?.find((d) => d.cityKey === mapCityFilter)?.id
      : undefined;
    setAddData({ lat: c.lat, lng: c.lng, dayId: dayForPlace });
    setAddOpen(true);
    setAddMode(false);
  };

  const visiblePlaces = filters.onlyPhotos ? [] : filtered;
  const visiblePhotos =
    filters.showPhotos && photosReady
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
        <MapCanvas
          ref={canvasRef}
          layer={tileLayer}
          center={initialCenter}
          zoom={mapCityFilter ? 12 : 8}
          fullscreen={fullscreen}
          active={active}
        >
          {/* Нити маршрута по дням */}
          {!filters.onlyPhotos && (
            <RouteThreads places={filtered} currentDayNumber={route?.meta.currentDayNumber} />
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
        </MapCanvas>

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
        {!addMode && !filters.onlyPhotos && filtered.length === 0 && allPlaces.length > 0 && (
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
                    resetFilters()
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
        currency={currencySymbol(route?.meta.currency)}
        onClose={() => setSelectedPlace(null)}
      />

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        cities={cities}
        filters={filters}
        onChange={patchFilters}
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
