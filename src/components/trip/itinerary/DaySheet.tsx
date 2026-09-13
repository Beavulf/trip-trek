"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Loader2, MapPin, Pencil } from "lucide-react";
import { useAddDay, useRouteDays, useUpdateDay } from "@/hooks/use-trip";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CityAutocomplete } from "../city-autocomplete";
import { encodeCustomKey } from "@/lib/city-coords";
import type { Day } from "@/lib/types";

const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

const COLOR_NAMES: Record<string, string> = {
  "#f97316": "Оранжевый",
  "#06b6d4": "Бирюзовый",
  "#8b5cf6": "Фиолетовый",
  "#ec4899": "Розовый",
  "#10b981": "Изумрудный",
  "#f59e0b": "Янтарный",
  "#ef4444": "Красный",
  "#3b82f6": "Синий",
};

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
  const { data: days } = useRouteDays();
  const [city, setCity] = useState("");
  const [selectedCity, setSelectedCity] = useState<{ name: string; lat: number; lng: number; timezone?: string; language?: string } | null>(null);
  const [changeCity, setChangeCity] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [color, setColor] = useState("#f97316");
  // Ключ-сессия: пересоздаёт CityAutocomplete с уже сброшенным value
  // (эффект идёт после рендера — без ключа поле мигает старым городом)
  const [citySession, setCitySession] = useState(0);

  // Фокус-трап, Escape, возврат фокуса на триггер (scroll-lock — в примитиве)
  const panelRef = useDialogA11y<HTMLDivElement>(open, () => onOpenChange(false));

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

  // open проверяет примитив внутри AnimatePresence — exit-анимация не ломается
  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      titleIcon={isEdit ? <Pencil className="size-5 text-primary" /> : <CalendarPlus className="size-5 text-primary" />}
      title={isEdit ? `День ${day!.dayNumber}` : "Новый день"}
      panelRef={panelRef}
      role="dialog"
      ariaLabel={isEdit ? `Редактирование дня ${day!.dayNumber}` : "Новый день"}
      maxHeightClass="max-h-[90vh]"
      contentClassName="space-y-3"
    >

            {!isEdit && (
              <div className="rounded-xl px-3 py-2 text-xs font-medium flex items-center gap-2" style={{ background: `${color}18`, color }}>
                <CalendarPlus className="size-3.5 shrink-0" />
                Это будет день №{nextDayNumber} маршрута
              </div>
            )}
            <div>
              <label htmlFor="day-city" className="text-xs text-muted-foreground mb-1 block">Город{isEdit ? "" : " *"}</label>
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
                  id="day-city"
                  key={citySession}
                  value={city}
                  onChange={setCity}
                  onSelect={(c) => setSelectedCity({ name: c.name, lat: c.lat, lng: c.lng, timezone: c.timezone, language: c.language })}
                  placeholder={isEdit ? "Выберите новый город…" : "Начни вводить город…"}
                />
              )}
            </div>
            <div>
              <label htmlFor="day-title" className="text-xs text-muted-foreground mb-1 block">Название дня (необязательно)</label>
              <input
                id="day-title"
                name="title"
                type="text"
                autoComplete="off"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, переезд в Шанхай…"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
              />
            </div>
            {isEdit && (
              <div>
                <label htmlFor="day-summary" className="text-xs text-muted-foreground mb-1 block">Коротко о дне</label>
                <input
                  id="day-summary"
                  name="summary"
                  type="text"
                  autoComplete="off"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Одной строкой — чем займётесь…"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile"
                />
              </div>
            )}
            <div>
              <div id="day-color-label" className="text-xs text-muted-foreground mb-1.5">Цвет дня</div>
              <div role="group" aria-labelledby="day-color-label" className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Цвет дня: ${COLOR_NAMES[c] ?? c}`}
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
    </MobileBottomSheet>
  );
}

/** Кнопка-триггер «Добавить день» — пунктирная плашка в конце маршрута */
export function AddDayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors active:scale-[0.98] min-h-11"
    >
      <CalendarPlus className="size-5" />
      <span className="text-sm font-medium">Добавить день</span>
    </button>
  );
}
