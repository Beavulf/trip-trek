"use client";

// Плитки галереи вынесены из gallery.tsx и мемоизированы: тап по фото и каждый свайп в
// лайтбоксе меняют состояние Gallery, а без memo это перерисовывало все 60+ плиток (каждая —
// framer-motion с inline-стилями). Объекты Photo из TanStack Query стабильны между
// рефетчами (structural sharing), поэтому memo реально срабатывает.
import { memo } from "react";
import { motion } from "framer-motion";
import { EyeOff, MapPin, Star } from "lucide-react";
import type { Photo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TileProps {
  photo: Photo;
  /** Индекс в отфильтрованном списке — им открывается лайтбокс */
  index: number;
  onOpen: (index: number) => void;
}

/** Плитка: фолбэк на оригинал, затем заглушка (thumb может отсутствовать/биться) */
function imgFallback(e: React.SyntheticEvent<HTMLImageElement>, photo: Photo) {
  const el = e.currentTarget;
  if (photo.url && el.src !== photo.url && !el.src.endsWith(photo.url)) {
    el.src = photo.url;
    return;
  }
  el.style.visibility = "hidden";
  const fallback = el.nextElementSibling as HTMLElement | null;
  if (fallback) fallback.hidden = false;
}

function FallbackNote({ className }: { className: string }) {
  return (
    <div hidden className={cn("w-full place-items-center text-muted-foreground text-xs p-2", className)}>
      Не удалось показать фото
    </div>
  );
}

export const MasonryTile = memo(function MasonryTile({
  photo,
  index,
  onOpen,
  animate,
}: TileProps & { animate: boolean }) {
  const hasDims = !!(photo.width && photo.height);
  const common = {
    type: "button" as const,
    onClick: () => onOpen(index),
    className:
      "masonry-item relative rounded-xl overflow-hidden bg-muted block w-full cursor-pointer active:scale-[0.98] transition-transform",
  };

  const body = (
    <>
      <img
        src={photo.thumbUrl || photo.url}
        alt={photo.caption || "Фото"}
        className={cn("w-full block bg-muted object-cover pointer-events-none", !hasDims && "min-h-[120px]")}
        loading="lazy"
        decoding="async"
        // Пропорции из метаданных: без них браузер считает каждую плитку заглушкой 120px,
        // подтягивает вдвое больше картинок, чем видно на экране, а колонки masonry
        // пересобираются после декодирования каждой — контент прыгает
        style={hasDims ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined}
        onError={(e) => imgFallback(e, photo)}
      />
      <FallbackNote className="min-h-[120px] grid" />
      {(photo.isFavorite || photo.hiddenFromPublic) && (
        <span className="absolute top-1.5 left-1.5 flex gap-1">
          {photo.isFavorite && (
            <span className="size-6 rounded-full bg-black/50 grid place-items-center">
              <Star className="size-3.5 fill-yellow-300 text-yellow-300" aria-hidden="true" />
            </span>
          )}
          {photo.hiddenFromPublic && (
            <span className="size-6 rounded-full bg-black/50 grid place-items-center" title="Скрыто от гостей">
              <EyeOff className="size-3.5 text-sky-300" aria-label="Скрыто от гостей" />
            </span>
          )}
        </span>
      )}
      {photo.user && (
        <span
          className="absolute top-1.5 right-1.5 size-6 rounded-full grid place-items-center text-[10px] border border-white/50"
          style={{ background: photo.user.color }}
          title={photo.user.name}
        >
          {photo.user.emoji}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 flex flex-col gap-0.5 pointer-events-none text-left">
        <span className="text-white/85 text-[10px] flex items-center gap-1 font-mono tracking-wide">
          <MapPin className="size-2.5" aria-hidden="true" />
          День {photo.day?.dayNumber}
          {photo.day?.city ? ` · ${photo.day.city}` : ""}
        </span>
        {photo.caption && <span className="text-white text-xs line-clamp-1">{photo.caption}</span>}
      </span>
    </>
  );

  // Ступенчатый вход — только у первых кадров (animate), остальные — обычная кнопка без
  // framer-motion: на длинных галереях лишние motion-компоненты стоили потока на телефоне
  return animate ? (
    <motion.button
      {...common}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.28), ease: [0.22, 1, 0.36, 1] }}
    >
      {body}
    </motion.button>
  ) : (
    <button {...common}>{body}</button>
  );
});

export const CompactTile = memo(function CompactTile({ photo, index, onOpen }: TileProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className="relative aspect-square overflow-hidden bg-muted active:scale-[0.97] transition-transform"
      aria-label={photo.caption || "Фото"}
    >
      <img
        src={photo.thumbUrl || photo.url}
        alt={photo.caption || "Фото"}
        className="w-full h-full object-cover pointer-events-none"
        loading="lazy"
        decoding="async"
        onError={(e) => imgFallback(e, photo)}
      />
      <FallbackNote className="absolute inset-0 grid" />
      {(photo.isFavorite || photo.hiddenFromPublic) && (
        <span className="absolute top-1 left-1 flex gap-0.5">
          {photo.isFavorite && (
            <Star className="size-3.5 fill-yellow-300 text-yellow-300 drop-shadow" aria-hidden="true" />
          )}
          {photo.hiddenFromPublic && <EyeOff className="size-3.5 text-sky-300 drop-shadow" aria-label="Скрыто от гостей" />}
        </span>
      )}
    </button>
  );
});
