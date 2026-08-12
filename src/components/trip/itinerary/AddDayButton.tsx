"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { useAddDay } from "@/hooks/use-trip";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CityAutocomplete } from "../city-autocomplete";
import { encodeCustomKey } from "@/lib/city-coords";

const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

export function AddDayButton() {
  const addDay = useAddDay();
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState("");
  const [selectedCity, setSelectedCity] = useState<{ name: string; lat: number; lng: number; timezone?: string; language?: string } | null>(null);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#f97316");

  useBodyScrollLock(open);

  const submit = async () => {
    const cityName = selectedCity?.name || city.trim() || "Новый город";
    await addDay.mutateAsync({
      city: cityName,
      cityKey: selectedCity ? encodeCustomKey(selectedCity.lat, selectedCity.lng) : "custom",
      title: title.trim() || undefined,
      accentColor: color,
    });
    toast.success("День добавлен! 📅");
    setCity("");
    setSelectedCity(null);
    setTitle("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors"
      >
        <CalendarPlus className="size-5" />
        <span className="text-sm font-medium">Добавить день</span>
      </button>
    );
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setOpen(false)}
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
              <CalendarPlus className="size-5 text-primary" /> Новый день
            </h2>
            <button onClick={() => setOpen(false)} className="size-11 rounded-full hover:bg-accent grid place-items-center" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Город</label>
              <CityAutocomplete
                value={city}
                onChange={setCity}
                onSelect={(c) => setSelectedCity({ name: c.name, lat: c.lat, lng: c.lng, timezone: c.timezone, language: c.language })}
                placeholder="Начни вводить город…"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название дня (необязательно)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, Переезд в Шанхай"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Цвет дня</label>
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
            {selectedCity?.language && (
              <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                💡 Язык города: <b className="uppercase">{selectedCity.language}</b> — погода появится во вкладке «Погода». Фразы можно загрузить во вкладке «Фразы».
              </div>
            )}
            <button
              onClick={submit}
              disabled={addDay.isPending}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {addDay.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
              {addDay.isPending ? "Создание…" : "Добавить день"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
