"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useTrip, useUploadPhoto, useAddExpense, useAddJournal } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { EXPENSE_CATEGORIES, type Day } from "@/lib/types";
import { Camera, Wallet, BookOpen, Loader2, Check, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "photo" | "expense" | "journal";

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("photo");
  const { data: trip } = useTrip();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus /> Быстрое добавление
          </SheetTitle>
          <SheetDescription>
            {trip ? `День ${trip.currentDayNumber} · ${trip.days.find(d => d.dayNumber === trip.currentDayNumber)?.city ?? ""}` : ""}
          </SheetDescription>
        </SheetHeader>

        {/* Выбор режима */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {([
            { key: "photo", label: "Фото", icon: Camera },
            { key: "expense", label: "Трата", icon: Wallet },
            { key: "journal", label: "Заметка", icon: BookOpen },
          ] as const).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all",
                  mode === m.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <Icon className="size-5" />
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {mode === "photo" && <PhotoForm onDone={() => onOpenChange(false)} />}
          {mode === "expense" && <ExpenseForm onDone={() => onOpenChange(false)} />}
          {mode === "journal" && <JournalForm onDone={() => onOpenChange(false)} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Plus() {
  return null;
}

function DayPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: trip } = useTrip();
  if (!trip) return null;
  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      defaultValue={currentDay?.id}
      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
    >
      {trip.days.map((d: Day) => (
        <option key={d.id} value={d.id}>
          День {d.dayNumber} · {d.city} — {d.title}
        </option>
      ))}
    </select>
  );
}

function PhotoForm({ onDone }: { onDone: () => void }) {
  const { data: trip } = useTrip();
  const upload = useUploadPhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");

  const onFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file || !dayId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dayId", dayId);
    fd.append("participantId", trip?.settings.currentUserId ?? "");
    if (caption) fd.append("caption", caption);
    try {
      await upload.mutateAsync(fd);
      toast.success("Фото добавлено 📸");
      setFile(null);
      setPreview(null);
      setCaption("");
      onDone();
    } catch {
      toast.error("Не удалось загрузить фото");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={preview} alt="preview" className="w-full max-h-60 object-cover" />
          <button
            onClick={() => { setFile(null); setPreview(null); }}
            className="absolute top-2 right-2 size-7 rounded-full bg-black/60 text-white grid place-items-center"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl py-10 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Camera className="size-8" />
          <span className="text-sm font-medium">Выбрать фото</span>
        </button>
      )}

      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Подпись (необязательно)"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />

      <button
        onClick={submit}
        disabled={!file || upload.isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {upload.isPending ? "Загрузка…" : "Добавить фото"}
      </button>
    </div>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { data: trip } = useTrip();
  const addExpense = useAddExpense();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !description) {
      toast.error("Укажите сумму и описание");
      return;
    }
    await addExpense.mutateAsync({
      amount: amt,
      category,
      description,
      paidById: trip!.settings.currentUserId!,
      dayId,
    });
    toast.success("Трата добавлена 💸");
    setAmount("");
    setDescription("");
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма ($)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (например, Ужин в SoHo)"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />

      <button
        onClick={submit}
        disabled={addExpense.isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {addExpense.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Добавить трату
      </button>
    </div>
  );
}

function JournalForm({ onDone }: { onDone: () => void }) {
  const { data: trip } = useTrip();
  const addJournal = useAddJournal();
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("😊");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");

  const moods = ["😊", "🤩", "😴", "🤤", "🥳", "🤔", "😍", "😰"];

  const submit = async () => {
    if (!content.trim()) {
      toast.error("Напишите что-нибудь");
      return;
    }
    await addJournal.mutateAsync({
      dayId,
      content,
      mood,
      participantId: trip!.settings.currentUserId ?? undefined,
    });
    toast.success("Запись добавлена в дневник 📔");
    setContent("");
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Настроение</label>
        <div className="flex gap-1 flex-wrap">
          {moods.map((m) => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className={cn(
                "size-10 rounded-lg text-xl grid place-items-center transition-all",
                mood === m ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Что запомнилось сегодня?"
        rows={4}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
      />

      <button
        onClick={submit}
        disabled={addJournal.isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {addJournal.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Сохранить запись
      </button>
    </div>
  );
}
