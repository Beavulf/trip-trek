"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import type { UserProfile } from "./types";

// Лица + тревел-предметы: аватар подстраивается под дух приложения
const EMOJIS = [
  "👤", "🧑", "👨", "👩", "🧔", "👱", "😎", "🤓",
  "🥳", "🧑‍🎨", "🐱", "🐶", "🦊", "🐻", "🐼", "🦁",
  "🐸", "🐙", "🦄", "🧳", "✈️", "🌍", "🗺️", "🧭",
  "⛺", "🎒", "🚵", "⛵", "🚂", "🌋", "🏝️", "🏔️",
  "🌴", "📷", "🌟", "🔥", "💎", "🌈", "⭐", "🍀",
];
const COLORS = [
  "#f97316", "#06b6d4", "#8b5cf6", "#ec4899",
  "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
  "#94a3b8", "#6366f1", "#14b8a6", "#e11d48",
];

interface EditProfileSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: UserProfile;
  uploadingAvatar: boolean;
  onAvatarFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
}

/** Шторка редактирования профиля: фото, имя, эмодзи, цвет */
export function EditProfileSheet({
  open,
  onOpenChange,
  profile,
  uploadingAvatar,
  onAvatarFile,
  onRemoveAvatar,
}: EditProfileSheetProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.name);
  const [emoji, setEmoji] = useState(profile.emoji);
  const [color, setColor] = useState(profile.color);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // При открытии — свежие значения из профиля
  useEffect(() => {
    if (open) {
      setName(profile.name);
      setEmoji(profile.emoji);
      setColor(profile.color);
    }
  }, [open, profile]);

  const nameOk = name.trim().length > 0;
  const dirty = name.trim() !== profile.name || emoji !== profile.emoji || color !== profile.color;

  const save = async () => {
    if (!nameOk || !dirty || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), emoji, color }),
      });
      if (!r.ok) throw new Error("update failed");
      toast.success("Профиль обновлён ✨");
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      onOpenChange(false);
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Редактировать профиль"
      titleIcon={<Pencil className="size-4 text-primary" />}
    >
      {/* Аватар + имя */}
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div
            className="size-20 rounded-2xl overflow-hidden grid place-items-center text-4xl border-2 border-border shadow-sm transition-colors"
            style={{ background: color }}
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <span className="select-none">{emoji}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 size-9 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg border-2 border-card"
            aria-label="Загрузить фото"
            title="Загрузить фото"
          >
            {uploadingAvatar ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
        </div>

        <div className="flex-1 min-w-0 pt-1">
          <label htmlFor="profile-name" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Имя
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Как тебя зовут"
            className={cn(
              "mt-1 w-full h-11 rounded-xl border bg-background px-3 text-base font-semibold outline-none transition-colors",
              name.trim() ? "border-border focus:border-primary focus:ring-2 focus:ring-primary/25" : "border-destructive/50"
            )}
          />
          {profile.avatarUrl ? (
            <button
              type="button"
              onClick={onRemoveAvatar}
              className="mt-2 inline-flex items-center gap-1.5 min-h-8 px-1 text-xs font-medium text-destructive hover:underline"
            >
              <Trash2 className="size-3.5" /> Убрать фото — вернуть эмодзи
            </button>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
              Фото или эмодзи на цветном фоне — видно соучастникам поездки
            </p>
          )}
        </div>
      </div>

      {/* Эмодзи */}
      <div className="mt-5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Эмодзи-аватар
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              aria-label={`Эмодзи ${e}`}
              aria-pressed={emoji === e}
              className={cn(
                "aspect-square rounded-xl text-xl grid place-items-center transition-all",
                emoji === e
                  ? "bg-primary/15 ring-2 ring-primary scale-105"
                  : "bg-muted hover:bg-accent active:scale-95"
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Цвет */}
      <div className="mt-5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Цвет
        </div>
        <div className="flex gap-2.5 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Цвет ${c}`}
              aria-pressed={color === c}
              className={cn(
                "size-9 rounded-full transition-all",
                color === c
                  ? "ring-2 ring-offset-2 ring-foreground scale-110"
                  : "opacity-60 hover:opacity-100 active:scale-95"
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Действия */}
      <div className="mt-6 flex gap-2 pb-1">
        <button
          type="button"
          onClick={save}
          disabled={!nameOk || !dirty || saving}
          className="flex-1 min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-40 active:scale-[0.98]"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Сохранить
        </button>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="px-5 min-h-12 rounded-2xl bg-secondary border border-border font-medium"
        >
          Отмена
        </button>
      </div>
    </MobileBottomSheet>
  );
}
