"use client";

import {
  useCreatePlace,
  useGeocode,
  useDays,
} from "@/hooks/use-trip";
import { CATEGORY_META } from "@/lib/types";
import {
  Loader2,
  Check,
  X,
  MapPin,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

export interface AddPlaceData {
  lat: number;
  lng: number;
  address?: string;
  dayId?: string;
  name?: string;
}

export function AddPlaceSheet({
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: AddPlaceData | null;
  onCreated?: () => void;
}) {
  useBodyScrollLock(open);
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
          className="bg-card w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto flex flex-col"
        >
          {/* handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
              <Plus className="size-5 text-primary" /> Новое место
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-8 rounded-full hover:bg-accent grid place-items-center">
              <X className="size-4" />
            </button>
          </div>

          {initial && (
            <AddPlaceForm
              key={`${initial.lat.toFixed(4)}-${initial.lng.toFixed(4)}-${open}`}
              initial={initial}
              onDone={() => {
                onOpenChange(false);
                onCreated?.();
              }}
              onCancel={() => onOpenChange(false)}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function AddPlaceForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: AddPlaceData;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data: days } = useDays();
  const create = useCreatePlace();
  const geocode = useGeocode();

  const [name, setName] = useState(initial.name || "");
  const [category, setCategory] = useState("sight");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState(initial.address || "");
  const [dayId, setDayId] = useState(initial.dayId || "");

  // Reverse geocoding — запускаем один раз при монтировании (если нет адреса)
  const [geoDone, setGeoDone] = useState(false);
  if (!geoDone && !initial.address && initial.lat && initial.lng) {
    setGeoDone(true);
    geocode.mutate(
      { lat: initial.lat, lng: initial.lng },
      {
        onSuccess: (res) => setAddress(res.address),
        onError: () => setAddress(`${initial.lat.toFixed(4)}, ${initial.lng.toFixed(4)}`),
      }
    );
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Введите название места");
      return;
    }
    if (!dayId) {
      toast.error("Выберите день");
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        lat: initial.lat,
        lng: initial.lng,
        dayId,
        timeOfDay: timeOfDay || undefined,
        budget: budget ? parseFloat(budget) : undefined,
        address: address.trim() || undefined,
      });
      toast.success("Место добавлено! 📍");
      onDone();
    } catch (err) {
      toast.error("Не удалось добавить место", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
      {/* координаты */}
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <MapPin className="size-3 shrink-0" />
        {geocode.isPending ? (
          <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Определяем адрес…</span>
        ) : (
          <span className="truncate">{address || `${initial.lat.toFixed(4)}, ${initial.lng.toFixed(4)}`}</span>
        )}
      </div>

      {/* название */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Уличная еда на углу"
          autoFocus
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* день + категория */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">День *</label>
          <select
            value={dayId}
            onChange={(e) => setDayId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          >
            <option value="">Выбрать…</option>
            {days?.map((d) => (
              <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          >
            {Object.entries(CATEGORY_META).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* время + бюджет */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Время суток</label>
          <select
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          >
            <option value="">Любое</option>
            <option value="morning">🌅 Утро</option>
            <option value="afternoon">☀️ День</option>
            <option value="evening">🌙 Вечер</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Бюджет $</label>
          <input
            type="number"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* адрес (редактируемый) */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1"><MapPin className="size-3" /> Адрес</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Адрес места"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* описание */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Заметка</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Что понравилось, что попробовать…"
          rows={2}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-medium"
        >
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={create.isPending || !name.trim() || !dayId}
          className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {create.isPending ? "…" : "Добавить"}
        </button>
      </div>
    </div>
  );
}
