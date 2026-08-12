"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Camera, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "./types";

const EMOJIS = ["👤", "🧑", "👨", "👩", "🧔", "👱", "👲", "👳", "🧑‍🦰", "👨‍🦳", "👩‍🦰", "🧑‍🎨", "😎", "🤓", "🥳", "🐱", "🐶", "🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸", "🐙", "🦄", "🌟", "🔥", "💎", "🌈"];
const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#94a3b8", "#6366f1", "#14b8a6", "#e11d48"];

interface ProfileAvatarProps {
  profile: UserProfile;
  name: string;
  setName: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  saving: boolean;
  uploadingAvatar: boolean;
  saveProfile: () => void;
  handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  avatarInputRef: React.RefObject<HTMLInputElement | null>;
  onCancel: () => void;
}

export function ProfileAvatar({
  profile,
  name,
  setName,
  emoji,
  setEmoji,
  color,
  setColor,
  saving,
  uploadingAvatar,
  saveProfile,
  handleAvatarUpload,
  avatarInputRef,
  onCancel,
}: ProfileAvatarProps) {
  return (
    <div className="mt-4 space-y-3">
      {/* Аватар с фото-загрузкой */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div
            className="size-20 rounded-2xl overflow-hidden grid place-items-center text-5xl shadow-xl border-2 border-background"
            style={{ background: color }}
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <button type="button" className="text-5xl">{emoji}</button>
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 size-8 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg border-2 border-background"
            title="Загрузить фото"
          >
            {uploadingAvatar ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-xs text-muted-foreground mb-1 block">Имя</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-lg font-bold bg-transparent border-b border-primary outline-none pb-0.5"
            placeholder="Имя"
            autoFocus
          />
        </div>
      </div>

      {/* Эмодзи выбор */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Аватар</label>
        <div className="flex gap-1.5 flex-wrap">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={cn(
                "size-10 rounded-xl text-xl grid place-items-center transition-all",
                emoji === e ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Цвет выбор */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Цвет</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                "size-9 rounded-full transition-all",
                color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Кнопки */}
      <div className="flex gap-2 pt-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={saveProfile}
          disabled={saving}
          className="flex-1 rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Сохранить
        </motion.button>
        <button
          onClick={onCancel}
          className="px-4 rounded-xl bg-secondary border border-border py-3 font-medium"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
