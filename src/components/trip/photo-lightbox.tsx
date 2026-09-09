"use client";

// Стили YARL обязательны: без styles.css контейнер лайтбокса рисуется
// position:static в потоке страницы — просмотр фото «не работает».
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import { Lightbox } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import {
  CalendarDays,
  Download,
  Heart,
  MapPin,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Photo } from "@/lib/types";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import { DayPicker } from "./quick-add/DayPicker";
import { useTrip } from "@/hooks/use-trip";

interface PhotoLightboxProps {
  open: boolean;
  index: number;
  photos: Photo[];
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onMapClick: (photo: Photo) => void;
  onDelete: (photoId: string) => void;
  canDelete: (photo: Photo) => boolean;
  pendingDelete: boolean;
  /** Переключить избранное (оптимистично обновляет кэш в родителе) */
  onToggleFavorite: (photo: Photo) => void;
  favoritePending: boolean;
  /** Сохранить подпись/день; resolve true — успех */
  onSaveEdit: (photoId: string, patch: { caption?: string | null; dayId?: string }) => Promise<boolean>;
  canEdit: (photo: Photo) => boolean;
}

function downloadName(p: Photo) {
  const base = (p.caption || `day-${p.day?.dayNumber ?? "x"}-${p.id}`).replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60);
  return `triptrek-${base}.jpg`;
}

/** Короткое человеческое время: «2 ч назад», «вчера, 18:40», «12 авг» */
function relTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} ч назад`;
  const yest = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (d.toDateString() === yest.toDateString()) return `вчера, ${hm}`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function PhotoLightbox({
  open,
  index,
  photos,
  onIndexChange,
  onClose,
  onMapClick,
  onDelete,
  canDelete,
  pendingDelete,
  onToggleFavorite,
  favoritePending,
  onSaveEdit,
  canEdit,
}: PhotoLightboxProps) {
  const { data: trip } = useTrip();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [caption, setCaption] = useState("");
  const [editDayId, setEditDayId] = useState("");
  const [saving, setSaving] = useState(false);

  const current = photos[index] ?? null;

  // Смена фото/закрытие — сбрасываем вложенные состояния шторки
  useEffect(() => {
    setMenuOpen(false);
    setEditOpen(false);
    setConfirmDelete(false);
  }, [index, open]);

  // Открываем форму с актуальными значениями текущего фото
  useEffect(() => {
    if (editOpen && current) {
      setCaption(current.caption ?? "");
      setEditDayId(current.dayId);
    }
  }, [editOpen, current]);

  if (!current) return null;

  const hasMapTarget = !!current.placeId || (current.lat != null && current.lng != null);
  const showOwnerActions = canDelete(current);
  const showEdit = canEdit(current);

  const slides = photos.map((p) => ({
    src: p.url,
    alt: p.caption ?? "Фото",
    // Captions plugin reads `title` (top) and `description` (bottom).
    title: p.caption ?? undefined,
    description: (
      <div className="flex items-center gap-2.5 text-xs opacity-80 flex-wrap">
        {p.isFavorite && (
          <span className="inline-flex items-center gap-1 text-yellow-300">
            <Star className="size-3 fill-yellow-300" /> Лучшее
          </span>
        )}
        {p.day && <span>День {p.day.dayNumber}</span>}
        {p.day?.city && <span>{p.day.city}</span>}
        {p.place?.name && <span>📍 {p.place.name}</span>}
        {p.user && <span>{p.user.emoji} {p.user.name}</span>}
        {p.takenAt && <span className="opacity-70">{relTime(p.takenAt)}</span>}
        {p.address && <span className="block w-full mt-0.5 opacity-70">{p.address}</span>}
      </div>
    ),
  }));

  // key обязателен: YARL рисует тулбар списком, иначе React ругается на детей без ключей
  const iconBtn = (key: string, label: string, onClick: () => void, node: React.ReactNode, opts?: { disabled?: boolean; className?: string }) => (
    <button
      key={key}
      type="button"
      disabled={opts?.disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={cn(
        "yarl__button",
        "size-11 rounded-full grid place-items-center text-white",
        "bg-white/10 hover:bg-white/20 active:scale-90 transition-transform",
        opts?.disabled && "opacity-30 pointer-events-none",
        opts?.className,
      )}
    >
      {node}
    </button>
  );

  const FavButton = iconBtn(
    "fav",
    current.isFavorite ? "Убрать из избранного" : "В избранное",
    () => onToggleFavorite(current),
    <Heart className={cn("size-5", current.isFavorite && "fill-rose-400 text-rose-400")} />,
    { disabled: favoritePending, className: current.isFavorite ? "bg-rose-400/20 hover:bg-rose-400/30" : undefined },
  );

  const MapButton = iconBtn(
    "map",
    "Открыть на карте",
    () => {
      // Кнопка всегда отвечает: без координат и места — честный тост, а не мёртвый тап
      if (hasMapTarget) onMapClick(current);
      else toast.info("У этого фото нет геометки");
    },
    <MapPin className="size-5" />,
  );

  const MoreButton = iconBtn("more", "Ещё действия", () => setMenuOpen(true), <MoreHorizontal className="size-5" />);

  const share = async (p: Photo) => {
    const abs = new URL(p.url, window.location.origin).href;
    try {
      const res = await fetch(p.url);
      const blob = await res.blob();
      const file = new File([blob], downloadName(p), { type: blob.type || "image/jpeg" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: p.caption ?? "Фото из поездки" });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: p.caption ?? "Фото из поездки", url: abs });
        return;
      }
      throw new Error("share unsupported");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(abs);
        toast.success("Ссылка на фото скопирована");
      } catch {
        toast.error("Не удалось поделиться фото");
      }
    }
  };

  const download = (p: Photo) => {
    const a = document.createElement("a");
    a.href = p.url;
    a.download = downloadName(p);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Фото скачивается");
  };

  const saveEdit = async () => {
    if (!current) return;
    setSaving(true);
    const ok = await onSaveEdit(current.id, {
      caption: caption.trim() || null,
      dayId: editDayId || undefined,
    });
    setSaving(false);
    if (ok) {
      setMenuOpen(false);
      setEditOpen(false);
    }
  };

  return (
    <>
      <Lightbox
        open={open}
        index={index}
        close={onClose}
        on={{
          view: ({ index: i }) => onIndexChange(i),
        }}
        slides={slides}
        plugins={[Captions, Counter, Zoom]}
        carousel={{ finite: false, preload: 1 }}
        // Мобильные удобства: свайп-навигация у YARL из коробки,
        // закрытие — кнопкой, тапом по фону или свайпом вниз
        controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
        captions={{ showToggle: false }}
        zoom={{ scrollToZoom: true, pinchZoomV4: true }}
        toolbar={{ buttons: [FavButton, MapButton, MoreButton, "close"] }}
      />

      {/* Шторка действий поверх лайтбокса (YARL = z 9999) */}
      <MobileBottomSheet
        open={open && menuOpen}
        onOpenChange={(v) => {
          if (!v) {
            setMenuOpen(false);
            setEditOpen(false);
            setConfirmDelete(false);
          }
        }}
        title="Действия с фото"
        titleIcon={<span aria-hidden="true">🖼️</span>}
        zIndexClass="z-[10100]"
      >
        {current && (
          <div className="space-y-2">
            {/* Мини-превью контекста */}
            <div className="flex items-center gap-2.5 rounded-2xl bg-muted/50 border border-border p-2.5">
              <img
                src={current.thumbUrl || current.url}
                alt=""
                className="size-12 rounded-xl object-cover shrink-0"
              />
              <div className="min-w-0 text-xs text-muted-foreground">
                <div className="text-sm font-medium text-foreground truncate">
                  {current.caption || "Без подписи"}
                </div>
                <div className="mt-0.5">
                  {current.day && <>День {current.day.dayNumber}</>}
                  {current.day?.city && <> · {current.day.city}</>}
                  {current.user && <> · {current.user.name}</>}
                </div>
              </div>
            </div>

            <ActionRow
              icon={<Heart className={cn("size-4", current.isFavorite && "fill-rose-500 text-rose-500")} />}
              label={current.isFavorite ? "Убрать из избранного" : "В избранное"}
              onClick={() => onToggleFavorite(current)}
              disabled={favoritePending}
            />
            <ActionRow
              icon={<MapPin className="size-4" />}
              label="Открыть на карте"
              onClick={() => {
                setMenuOpen(false);
                if (hasMapTarget) onMapClick(current);
                else toast.info("У этого фото нет геометки");
              }}
            />
            {showEdit && (
              <ActionRow
                icon={<Pencil className="size-4" />}
                label="Подпись и день"
                onClick={() => setEditOpen(true)}
                hidden={editOpen}
              />
            )}
            <ActionRow icon={<Download className="size-4" />} label="Скачать" onClick={() => download(current)} />
            <ActionRow icon={<Share2 className="size-4" />} label="Поделиться" onClick={() => share(current)} />
            {showOwnerActions && (
              <ActionRow
                icon={<Trash2 className="size-4" />}
                label="Удалить фото"
                destructive
                hidden={confirmDelete}
                onClick={() => setConfirmDelete(true)}
              />
            )}

            {showEdit && editOpen && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <Pencil className="size-4" /> Редактирование
                </div>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Подпись к фото"
                  maxLength={300}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base input-mobile"
                />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> День поездки
                  </label>
                  <DayPicker value={editDayId} onChange={setEditDayId} />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {saving ? "Сохраняем…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="min-h-11 px-4 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium active:scale-[0.98] transition-transform"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {showOwnerActions && confirmDelete && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3 space-y-2">
                <p className="text-sm font-medium">Удалить это фото навсегда?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pendingDelete}
                    onClick={() => onDelete(current.id)}
                    className="flex-1 min-h-11 rounded-xl bg-red-500 text-white text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {pendingDelete ? "Удаляем…" : "Удалить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-11 px-4 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium active:scale-[0.98] transition-transform"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {trip && (
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                {trip.settings?.title || "Поездка"} · фото из общего альбома
              </p>
            )}
          </div>
        )}
      </MobileBottomSheet>
    </>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  destructive,
  disabled,
  hidden,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full min-h-11 rounded-xl border border-border bg-card px-3 flex items-center gap-2.5 text-sm font-medium",
        "active:scale-[0.98] transition-transform disabled:opacity-50",
        destructive ? "text-red-600" : "hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
