"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarPlus, Loader2, MapPin, Pencil, X } from "lucide-react";
import { useAddDay, useDays, useUpdateDay } from "@/hooks/use-trip";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CityAutocomplete } from "../city-autocomplete";
import { encodeCustomKey } from "@/lib/city-coords";
import type { Day } from "@/lib/types";

const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

interface DaySheetProps {
  /** null/undefined → режим создания; день → редактирование */
  day?: Day | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Единый шит дня: создание (кнопка-триггер отдельно) и редактирование
 * существующего дня — город, название, краткое описание, цвет.
 */
export function DaySheet({ day, open, onOpenChange }: DaySheetProps) {
  const isEdit = !!day;
  const addDay = useAddDay();
  const updateDay = useUpdateDay();
  const { data: days } = useDays();
  const [city, setCity] = useState("");
  const [selectedCity, setSelectedCity] = useState<{ name: string; lat: number; lng: number; timezone?: string; language?: string } | null>(null);
  const [changeCity, setChangeCity] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [color, setColor] = useState("#f97316");
  // Ключ-сессия: пересоздаёт CityAutocomplete с уже сброшенным value
  // (эффект идёт после рендера — без ключа поле мигает старым городом)
  const [citySession, setCitySession] = useState(0);

  useBodyScrollLock(open);

  // Пересобираем форму при открытии (и при смене редактируемого дня)
  useEffect(() => {
    if (!open) return;
    setCity(day?.city ?? "");
    setSelectedCity(null);
    setChangeCity(false);
    setTitle(day?.title || "");
    setSummary(day?.summary || "");
    setColor(day?.accentColor || "#f97316");
    setCitySession((s) => s + 1);
  }, [open, day]);

  const pending = addDay.isPending || updateDay.isPending;
  const nextDayNumber = (days?.length ?? 0) + 1;

  const submit = async () => {
    if (isEdit && day) {
      const data: { city?: string; cityKey?: string; title?: string; summary?: string; accentColor?: string } = {
        title: title.trim() || `День ${day.dayNumber}`,
        summary: summary.trim(),
        accentColor: color,
      };
      if (selectedCity) {
        data.city = selectedCity.name;
        data.cityKey = encodeCustomKey(selectedCity.lat, selectedCity.lng);
      }
      try {
        await updateDay.mutateAsync({ id: day.id, ...data });
        toast.success(`День ${day.dayNumber} обновлён`);
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось сохранить день");
      }
      return;
    }

    if (!selectedCity) {
      toast.error("Выбери город из списка", {
        description: "Без города не получится добавлять места и погоду в этот день",
      });
      return;
    }
    try {
      await addDay.mutateAsync({
        city: selectedCity.name,
        cityKey: encodeCustomKey(selectedCity.lat, selectedCity.lng),
        title: title.trim() || undefined,
        accentColor: color,
      });
      toast.success(`День ${nextDayNumber} добавлен! 📅`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить день");
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-y-auto max-h-[90vh]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              {isEdit ? <Pencil className="size-5 text-primary" /> : <CalendarPlus className="size-5 text-primary" />}
              {isEdit ? `День ${day!.dayNumber}` : "Новый день"}
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-11 rounded-full hover:bg-accent grid place-items-center" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {!isEdit && (
              <div className="rounded-xl px-3 py-2 text-xs font-medium flex items-center gap-2" style={{ background: `${color}18`, color }}>
                <CalendarPlus className="size-3.5 shrink-0" />
                Это будет день №{nextDayNumber} маршрута
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Город{isEdit ? "" : " *"}</label>
              {isEdit && !changeCity ? (
                <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2.5 text-sm">
                  <MapPin className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{day?.city}</span>
                  <button
                    type="button"
                    onClick={() => setChangeCity(true)}
                    className="ml-auto shrink-0 text-xs text-primary hover:underline min-h-11 px-1"
                  >
                    Сменить
                  </button>
                </div>
              ) : (
                <CityAutocomplete
                  key={citySession}
                  value={city}
                  onChange={setCity}
                  onSelect={(c) => setSelectedCity({ name: c.name, lat: c.lat, lng: c.lng, timezone: c.timezone, language: c.language })}
                  placeholder={isEdit ? "Выберите новый город…" : "Начни вводить город…"}
                />
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название дня (необязательно)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, Переезд в Шанхай"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
              />
            </div>
            {isEdit && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Коротко о дне</label>
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Одной строкой — чем займётесь"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Цвет дня</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Цвет ${c}`}
                    aria-pressed={color === c}
                    className={cn(
                      "size-11 rounded-full transition-all",
                      color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            {selectedCity?.language && (
              <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                💡 Язык города: <b className="uppercase">{selectedCity.language}</b> — погода появится во вкладке «Погода». Фразы можно загрузить во вкладке «Фразы».
              </div>
            )}
            <button
              onClick={submit}
              disabled={pending}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-11"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <CalendarPlus className="size-4" />}
              {pending ? "Сохранение…" : isEdit ? "Сохранить день" : "Добавить день"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

/** Кнопка-триггер «Добавить день» — пунктирная плашка в конце маршрута */
export function AddDayButton({ onClick }: { onClick?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => (onClick ? onClick() : setOpen(true))}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors active:scale-[0.98] min-h-11"
      >
        <CalendarPlus className="size-5" />
        <span className="text-sm font-medium">Добавить день</span>
      </button>
      {!onClick && <DaySheet open={open} onOpenChange={setOpen} />}
    </>
  );
}
