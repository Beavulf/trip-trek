"use client";

// MapCanvas — глубокий модуль карты: владеет Leaflet-контейнером и всей хрупкой
// жизнью (готовность инстанса, полёты, invalidateSize после fullscreen, заморозка
// анимаций на drag). Вместо таймерного фольклора — очередь команд FIFO: полёты
// исполняются строго в порядке вызова, как только инстанс готов, поэтому порядок
// «mount-fitBounds, потом фокус» больше не зависит от миллисекунд.
// Наружу — императивный интерфейс (MapCanvasHandle) и children-слот для
// декларативных маркеров/попапов. Кандидат №3 аудита 2026-09-12, фаза 4d.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import { TILE_LAYERS, type MapLayerKey } from "@/lib/map-layers";

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface MapCanvasHandle {
  /** Полёт к точке; итоговый зум = max(текущий, zoomBoost). */
  focusOn(point: MapPoint, opts?: { zoomBoost?: number; duration?: number }): void;
  /** Подогнать вид под точки мгновенно (без анимации) — стартовый вид и «весь маршрут». */
  fitPoints(points: MapPoint[], opts?: { padding?: [number, number] }): void;
  /** Полёт с автозумом под точки (город); одна точка — полёт к ней не ниже minZoom. */
  flyToPoints(points: MapPoint[], minZoom: number): void;
  /** Мгновенный шаг зума (кнопки +/−). */
  zoomBy(delta: number): void;
  /** Центр карты сейчас (прицел режима добавления). */
  getCenter(): MapPoint | null;
}

interface MapCanvasProps {
  layer: MapLayerKey;
  center: MapPoint;
  zoom: number;
  /** Полноэкранный режим: контейнер меняется — пересчитать размер после css-перехода */
  fullscreen?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Полёт к точкам с автозумом; одна точка — просто полёт не ниже minZoom. */
function flyToPts(map: L.Map, pts: MapPoint[], minZoom: number) {
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

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { layer, center, zoom, fullscreen, className, children },
  ref
) {
  const mapRef = useRef<L.Map | null>(null);
  // Готовность инстанса и очередь команд: до готовности команды копятся,
  // после — исполняются немедленно; порядок вызовов сохраняется.
  const queueRef = useRef<Array<(m: L.Map) => void>>([]);
  const readyRef = useRef(false);

  // Колесо мыши зумит только на десктопе (на мобильном колесо нет, а страница не должна скроллиться «в карту»)
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 641px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Дожидаемся инстанса карты (появляется асинхронно, иногда позже спиннера
  // загрузки), исполняем накопленные команды и вешаем заморозку анимаций:
  // пока карту тащат — «постоянные» анимации (пульс пинов, бегущий пунктир)
  // замирают, иначе repaint каждого кадра складывается с тайлами и лагает drag.
  useEffect(() => {
    let tries = 0;
    const iv = setInterval(() => {
      const map = mapRef.current;
      if (map) {
        clearInterval(iv);
        readyRef.current = true;
        const queued = queueRef.current;
        queueRef.current = [];
        queued.forEach((fn) => fn(map));
        const el = map.getContainer();
        map.on("movestart", () => el.classList.add("map-anim-paused"));
        map.on("moveend", () => el.classList.remove("map-anim-paused"));
      } else if (++tries > 40) {
        clearInterval(iv);
      }
    }, 250);
    return () => {
      clearInterval(iv);
      readyRef.current = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focusOn(point, opts) {
      const run = (m: L.Map) => {
        m.flyTo([point.lat, point.lng], Math.max(m.getZoom(), opts?.zoomBoost ?? 15), {
          duration: opts?.duration ?? 0.7,
        });
      };
      if (readyRef.current && mapRef.current) run(mapRef.current);
      else queueRef.current.push(run);
    },
    fitPoints(points, opts) {
      const run = (m: L.Map) => {
        // сразу после выхода из полного экрана размер мог измениться,
        // а fitBounds считает его сам — пересчитываем принудительно
        m.invalidateSize();
        if (points.length === 0) return;
        if (points.length === 1) {
          m.setView([points[0].lat, points[0].lng], Math.max(m.getZoom(), 12), { animate: false });
          return;
        }
        m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), {
          padding: opts?.padding ?? [48, 48],
          animate: false,
        });
      };
      if (readyRef.current && mapRef.current) run(mapRef.current);
      else queueRef.current.push(run);
    },
    flyToPoints(points, minZoom) {
      const run = (m: L.Map) => flyToPts(m, points, minZoom);
      if (readyRef.current && mapRef.current) run(mapRef.current);
      else queueRef.current.push(run);
    },
    zoomBy(delta) {
      const m = mapRef.current;
      if (m) m.setZoom(m.getZoom() + delta, { animate: false });
    },
    getCenter() {
      const m = mapRef.current;
      if (!m) return null;
      const c = m.getCenter();
      return { lat: c.lat, lng: c.lng };
    },
  }), []);

  // Полноэкранный режим: Leaflet не знает, что контейнер изменился —
  // пересчитываем размер после css-перехода, иначе тайлы не дорастянутся.
  useEffect(() => {
    const map = mapRef.current;
    if (!fullscreen || !map) return;
    const t1 = setTimeout(() => map.invalidateSize(), 80);
    const t2 = setTimeout(() => map.invalidateSize(), 420);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fullscreen]);

  return (
    <MapContainer
      ref={mapRef}
      center={[center.lat, center.lng]}
      zoom={zoom}
      scrollWheelZoom={isDesktop}
      zoomControl={false}
      className={className ?? "w-full h-full bg-muted"}
    >
      <TileLayer
        key={layer}
        attribution={TILE_LAYERS[layer].attr}
        url={TILE_LAYERS[layer].url}
        keepBuffer={4}
      />
      {children}
    </MapContainer>
  );
});
