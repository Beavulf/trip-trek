"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Аватар участника: фото профиля, если загружено, иначе эмодзи на цвете.
 * Один источник правды для ленты, бюджета и расчётов — чтобы загруженная
 * аватарка показывалась везде, где «выглядит» участник.
 */
export function UserAvatar({
  name,
  emoji,
  color,
  avatarUrl,
  className,
  textClassName,
}: {
  name: string;
  emoji: string;
  color: string;
  avatarUrl?: string | null;
  className?: string;
  textClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = !!avatarUrl && !broken;
  return (
    <span
      className={cn("rounded-full grid place-items-center shrink-0 overflow-hidden select-none", className)}
      style={{ background: showImage ? undefined : color }}
      aria-hidden="true"
      title={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl!}
          alt=""
          className="size-full object-cover"
          onError={() => setBroken(true)}
          loading="lazy"
        />
      ) : (
        <span className={cn("leading-none", textClassName)}>{emoji}</span>
      )}
    </span>
  );
}
