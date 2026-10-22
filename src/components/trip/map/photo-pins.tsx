"use client";

// Слой фото-меток карты: кластеры по экранной сетке и только то, что в кадре.
// Почему не <Marker> на каждое фото — см. src/lib/photo-pins.ts (сотни одновременных
// запросов и битмапов на телефоне). Пересчёт — по окончании жеста (moveend/zoomend/resize),
// не на каждый кадр перетаскивания.
import { useMemo, useSyncExternalStore } from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin } from "lucide-react";
import type { Photo } from "@/lib/types";
import { MAX_PIN_ZOOM, clusterPins, splitsAtZoom, type PinBounds, type PinCluster } from "@/lib/photo-pins";
import { makePhotoClusterIcon, makePhotoIcon } from "./icons";

interface MapView {
  zoom: number;
  bounds: PinBounds;
}

function readView(map: L.Map): MapView {
  // pad: метки чуть за краем кадра уже стоят на месте, когда карту подтащили пальцем
  const b = map.getBounds().pad(0.25);
  return {
    zoom: map.getZoom(),
    bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
  };
}

const sameView = (a: MapView, b: MapView) =>
  a.zoom === b.zoom &&
  a.bounds.south === b.bounds.south &&
  a.bounds.west === b.bounds.west &&
  a.bounds.north === b.bounds.north &&
  a.bounds.east === b.bounds.east;

const thumbOf = (p: Photo) => p.thumbUrl || p.url;

/**
 * Вид карты как внешний стор для useSyncExternalStore. Не useState+useEffect: подписка на
 * события встаёт только после рендера, и стартовый fitBounds карты, случившийся между ними,
 * терялся — метки считались бы по старому виду, часть фото оказывалась «за границами».
 * Снимок обновляют только события карты (по окончании жеста), а не чтение на каждом рендере:
 * иначе любой посторонний рендер посреди перетаскивания пересчитывал бы метки на лету.
 */
function createMapViewStore(map: L.Map) {
  let current = readView(map);
  return {
    subscribe(onChange: () => void) {
      const refresh = () => {
        const next = readView(map);
        // Тот же вид → прежний объект: zoomend и следом moveend не должны давать два пересчёта
        if (sameView(current, next)) return;
        current = next;
        onChange();
      };
      // resize — карта вернулась со скрытой вкладки (display:none обнуляет размеры, а с ними
      // и видимые границы): invalidateSize стреляет resize+moveend, метки вернутся сами
      map.on("moveend zoomend resize", refresh);
      // Вид мог измениться между рендером (откуда взят current) и этой подпиской
      refresh();
      return () => {
        map.off("moveend zoomend resize", refresh);
      };
    },
    getSnapshot: () => current,
  };
}

export function PhotoPins({
  photos,
  onOpenFullscreen,
}: {
  photos: readonly Photo[];
  onOpenFullscreen: (photo: Photo) => void;
}) {
  const map = useMap();
  const store = useMemo(() => createMapViewStore(map), [map]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const clusters = useMemo(() => clusterPins(photos, { zoom: view.zoom, bounds: view.bounds }), [photos, view]);

  return (
    <>
      {clusters.map((c) =>
        c.items.length === 1 ? (
          <Marker key={c.key} position={[c.lat, c.lng]} icon={makePhotoIcon(thumbOf(c.cover))}>
            <Popup>
              <PhotoPopupContent photo={c.cover} onOpenFullscreen={() => onOpenFullscreen(c.cover)} />
            </Popup>
          </Marker>
        ) : (
          <ClusterPin key={c.key} cluster={c} zoom={view.zoom} onOpenFullscreen={onOpenFullscreen} />
        )
      )}
    </>
  );
}

function ClusterPin({
  cluster,
  zoom,
  onOpenFullscreen,
}: {
  cluster: PinCluster<Photo>;
  zoom: number;
  onOpenFullscreen: (photo: Photo) => void;
}) {
  const map = useMap();
  const bounds = useMemo(
    () => L.latLngBounds(cluster.items.map((p) => [p.lat as number, p.lng as number] as [number, number])),
    [cluster.items]
  );
  // Тап: если приближение разведёт кластер — летим к его границам. Снято в одной точке
  // (сколько ни зуми, метка не разойдётся) — раскрываем список снимков в попапе.
  const canZoomIn = useMemo(() => {
    const target = Math.min(map.getBoundsZoom(bounds, false, L.point(56, 56)), MAX_PIN_ZOOM);
    return target > zoom && splitsAtZoom(cluster.items, target);
  }, [map, bounds, zoom, cluster.items]);

  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={makePhotoClusterIcon(thumbOf(cluster.cover), cluster.items.length)}
      eventHandlers={
        canZoomIn
          ? { click: () => map.flyToBounds(bounds, { padding: [56, 56], maxZoom: MAX_PIN_ZOOM, duration: 0.6 }) }
          : undefined
      }
    >
      {!canZoomIn && (
        <Popup>
          <ClusterPopupContent items={cluster.items} onOpenFullscreen={onOpenFullscreen} />
        </Popup>
      )}
    </Marker>
  );
}

/** Список снимков из одной точки: превью-сетка, тап — полноэкранный просмотр */
function ClusterPopupContent({
  items,
  onOpenFullscreen,
}: {
  items: Photo[];
  onOpenFullscreen: (photo: Photo) => void;
}) {
  const shown = items.slice(0, 12);
  return (
    <div className="p-1 w-52">
      <div className="text-xs font-medium mb-1.5">{items.length} фото здесь</div>
      <div className="grid grid-cols-4 gap-1">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpenFullscreen(p)}
            className="aspect-square rounded-md overflow-hidden bg-muted active:scale-95 transition-transform"
            aria-label={p.caption || "Открыть фото"}
          >
            <img src={thumbOf(p)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          </button>
        ))}
      </div>
      {items.length > shown.length && (
        <div className="text-[10px] text-muted-foreground mt-1">и ещё {items.length - shown.length}</div>
      )}
    </div>
  );
}

/** Фото в попапе одиночной метки */
function PhotoPopupContent({ photo, onOpenFullscreen }: { photo: Photo; onOpenFullscreen: () => void }) {
  return (
    <div className="p-1 w-48">
      {/* thumbnail, не оригинал: попап маленький, декодить full-size ради 192px — трата декодера и памяти */}
      <img src={thumbOf(photo)} alt={photo.caption || ""} className="w-full h-32 object-cover rounded-lg mb-1.5" />
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
