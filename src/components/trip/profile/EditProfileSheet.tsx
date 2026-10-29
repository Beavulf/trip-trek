"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { PROFILE_COLORS, PROFILE_EMOJIS } from "@/lib/avatar-presets";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import type { UserProfile } from "./types";

// Названия цветов для скринридера: «Цвет #f97316» ничего не говорит, «оранжевый» — говорит
const COLOR_NAMES: Record<string, string> = {
  "#f97316": "оранжевый",
  "#06b6d4": "голубой",
  "#8b5cf6": "фиолетовый",
  "#ec4899": "розовый",
  "#10b981": "изумрудный",
  "#f59e0b": "янтарный",
  "#ef4444": "красный",
  "#3b82f6": "синий",
  "#94a3b8": "серый",
  "#6366f1": "индиго",
  "#14b8a6": "бирюзовый",
  "#e11d48": "малиновый",
};

const NAME_MAX = 30;
const PAYMENT_MAX = 300;

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
  // Реквизиты для возврата долгов — отдельная опциональная строка
  const [paymentDetails, setPaymentDetails] = useState(profile.paymentDetails ?? "");
  const [saving, setSaving] = useState(false);
  // Показываем ошибку имени только после попытки сохранить или ухода из поля: пустое поле в момент
  // открытия (или пока человек стирает старое имя, чтобы набрать новое) не должно сразу краснеть
  const [nameTouched, setNameTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Свежие значения из профиля — только в момент ОТКРЫТИЯ шторки. Раньше эффект зависел и от profile:
  // загрузка фото (или любой фоновый рефетч) подменяла объект профиля, и всё, что человек успел
  // набрать в шторке — имя, цвет, реквизиты, — молча откатывалось к сохранённому
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(profile.name);
      setEmoji(profile.emoji);
      setColor(profile.color);
      setPaymentDetails(profile.paymentDetails ?? "");
      setNameTouched(false);
    }
    wasOpen.current = open;
  }, [open, profile]);

  const nameOk = name.trim().length > 0;
  const showNameError = nameTouched && !nameOk;
  const dirty =
    name.trim() !== profile.name ||
    emoji !== profile.emoji ||
    color !== profile.color ||
    paymentDetails.trim() !== (profile.paymentDetails ?? "");

  const save = async () => {
    if (saving) return;
    if (!nameOk) {
      setNameTouched(true);
      return;
    }
    if (!dirty) return;
    setSaving(true);
    try {
      const r = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), emoji, color, paymentDetails: paymentDetails.trim() || null }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(typeof b?.error === "string" ? b.error : "");
      }
      toast.success("Профиль обновлён ✨");
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      onOpenChange(false);
    } catch (e) {
      toast.error("Не удалось сохранить", {
        description: e instanceof Error && e.message ? e.message : "Проверьте соединение и попробуйте ещё раз",
      });
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
            className="size-20 rounded-2xl overflow-hidden grid place-items-center text-4xl border-2 border-border shadow-sm transition-colors duration-200 motion-reduce:transition-none"
            style={{ background: color }}
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="Текущее фото профиля"
                decoding="async"
                className="w-full h-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              />
            ) : (
              <span className="select-none" aria-hidden>{emoji}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-2 -right-2 size-11 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg border-2 border-card outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card transition-transform duration-150 ease-out active:scale-95 disabled:opacity-70 motion-reduce:transition-none"
            aria-label={uploadingAvatar ? "Загружаем фото…" : "Загрузить фото"}
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
            onBlur={() => setNameTouched(true)}
            onKeyDown={(e) => {
              // Enter в поле имени = «Сохранить» (на телефоне — кнопка «Готово» на клавиатуре)
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void save();
              }
            }}
            maxLength={NAME_MAX}
            placeholder="Как тебя зовут"
            autoComplete="nickname"
            enterKeyHint="done"
            aria-invalid={showNameError}
            aria-describedby={showNameError ? "profile-name-error" : undefined}
            className={cn(
              "mt-1 w-full h-11 rounded-xl border bg-background px-3 text-base font-semibold outline-none transition-[border-color,box-shadow] duration-150",
              showNameError ? "border-destructive/60 focus:ring-2 focus:ring-destructive/25" : "border-border focus:border-primary focus:ring-2 focus:ring-primary/25"
            )}
          />
          {showNameError ? (
            <p id="profile-name-error" role="alert" className="mt-1.5 text-[11px] text-destructive leading-snug">
              Введите имя — его увидят участники поездок
            </p>
          ) : profile.avatarUrl ? (
            <button
              type="button"
              onClick={onRemoveAvatar}
              className="mt-1 inline-flex items-center gap-1.5 min-h-10 px-1 text-xs font-medium text-destructive outline-none hover:underline focus-visible:underline"
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
      <div className="mt-6">
        <div id="profile-emoji-label" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Эмодзи-аватар
        </div>
        <div role="radiogroup" aria-labelledby="profile-emoji-label" className="grid grid-cols-8 gap-1.5">
          {PROFILE_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              aria-label={`Эмодзи ${e}`}
              onClick={() => setEmoji(e)}
              className={cn(
                "aspect-square rounded-xl text-xl grid place-items-center outline-none transition-[background-color,box-shadow,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
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
      <div className="mt-6">
        <div id="profile-color-label" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Цвет
        </div>
        <div role="radiogroup" aria-labelledby="profile-color-label" className="flex gap-2 flex-wrap">
          {PROFILE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Цвет: ${COLOR_NAMES[c] ?? c}`}
              onClick={() => setColor(c)}
              className={cn(
                "size-10 rounded-full outline-none transition-[opacity,box-shadow,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none",
                color === c
                  ? "ring-2 ring-offset-2 ring-offset-card ring-foreground scale-110"
                  : "opacity-60 hover:opacity-100 active:scale-95"
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Реквизиты для возврата долгов */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="profile-payment" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Куда возвращать долги
          </label>
          {/* Счётчик показываем, только когда лимит близко — иначе это шум */}
          {paymentDetails.length > PAYMENT_MAX - 60 && (
            <span className="text-[10px] tabular-nums text-muted-foreground" aria-live="polite">
              {paymentDetails.length}/{PAYMENT_MAX}
            </span>
          )}
        </div>
        <textarea
          id="profile-payment"
          value={paymentDetails}
          onChange={(e) => setPaymentDetails(e.target.value)}
          maxLength={PAYMENT_MAX}
          rows={2}
          aria-describedby="profile-payment-hint"
          placeholder="Номер карты / телефона — увидят участники твоих поездок при расчёте"
          className="input-mobile mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25 resize-none"
        />
        <p id="profile-payment-hint" className="mt-1.5 text-[11px] text-muted-foreground leading-snug text-pretty">
          Показывается только соучастникам поездки — в экране «Расчёт между друзьями»,
          чтобы не кидать карту в общий чат
        </p>
      </div>

      {/* Действия */}
      <div className="mt-6 flex gap-2 pb-1">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="flex-1 min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card transition-[opacity,transform] duration-150 ease-out disabled:opacity-40 active:scale-[0.98] motion-reduce:transition-none"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={saving}
          className="px-5 min-h-12 rounded-2xl bg-secondary border border-border font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary transition-colors duration-150 disabled:opacity-60"
        >
          Отмена
        </button>
      </div>
    </MobileBottomSheet>
  );
}
