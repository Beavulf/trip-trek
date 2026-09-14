"use client";

import { useState, useRef } from "react";
import { Download, Upload, Loader2, Database, ChevronRight, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useCurrentTripId, useTrip } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripStore } from "@/lib/trip-store";

export function DataBackup() {
  const tripId = useCurrentTripId();
  const { setTripSwitcherOpen } = useTripStore();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data: trip } = useTrip();
  const { data: session } = useAuth();

  // Бэкап — полный дамп поездки, важная функция владельца (API отдаёт 403 остальным)
  const myId = session?.user?.id;
  const isOwner = !!myId && (trip?.participants ?? []).some((m) => m.id === myId && m.role === "owner");

  if (!tripId) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 text-center space-y-2">
        <Database className="size-5 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Нет активной поездки</p>
        <p className="text-xs text-muted-foreground">Выбери поездку, чтобы сделать бэкап</p>
        <button
          type="button"
          onClick={() => setTripSwitcherOpen(true)}
          className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
        >
          Мои поездки →
        </button>
      </div>
    );
  }

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/export?tripId=${tripId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Экспорт не удался");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `triptrek-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Данные экспортированы! 📥");
    } catch (e) {
      toast.error("Не удалось экспортировать", {
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.app && data.app !== "TripTrek") {
        throw new Error("Это не файл TripTrek");
      }
      if (!data.app && !data.trip) {
        throw new Error("Неверный формат файла");
      }
      const res = await fetch(`/api/import?tripId=${tripId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Импорт не удался");
      }
      const result = await res.json().catch(() => ({}));
      await qc.invalidateQueries();
      toast.success("Данные импортированы", {
        description: result.note || "Маршрут, траты, фразы и чек-лист добавлены. Фото/дневник — нет.",
      });
      setConfirmImport(false);
    } catch (e) {
      toast.error("Ошибка импорта: " + (e as Error).message);
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="size-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
          <Database className="size-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">Данные поездки</div>
          <div className="text-xs text-muted-foreground leading-snug">
            Резервная копия: маршрут, траты, фразы, чек-лист
          </div>
        </div>
      </div>

      {/* Экспорт — только владельцу (полный дамп поездки) */}
      {isOwner ? (
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || importing}
          aria-label="Экспортировать данные поездки"
          className="w-full min-h-14 rounded-xl border border-border px-3 flex items-center gap-3 hover:bg-accent transition-colors disabled:opacity-50 text-left"
        >
          {exporting ? (
            <Loader2 className="size-5 text-primary animate-spin shrink-0" />
          ) : (
            <Download className="size-5 text-primary shrink-0" />
          )}
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium">{exporting ? "Экспорт…" : "Экспорт"}</span>
            <span className="block text-xs text-muted-foreground">Скачать JSON-файл на устройство</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        </button>
      ) : (
        <div className="w-full min-h-14 rounded-xl border border-border/60 px-3 flex items-center gap-3 text-left text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          <span className="text-xs leading-snug">Экспорт и импорт данных доступны владельцу поездки</span>
        </div>
      )}

      {/* Импорт */}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => setConfirmImport(true)}
        disabled={importing || exporting || !isOwner}
        aria-label="Импортировать данные из JSON"
        className={cn(
          "w-full min-h-14 rounded-xl border px-3 mt-2 flex items-center gap-3 transition-colors disabled:opacity-50 text-left",
          confirmImport ? "border-amber-500/40 bg-amber-500/5" : "border-border hover:bg-accent"
        )}
      >
        {importing ? (
          <Loader2 className="size-5 text-primary animate-spin shrink-0" />
        ) : (
          <Upload className="size-5 text-primary shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">{importing ? "Импорт…" : "Импорт"}</span>
          <span className="block text-xs text-muted-foreground">Загрузить данные из JSON-файла</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </button>

      <AnimatePresence>
        {confirmImport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong>Внимание:</strong> данные добавятся в текущую поездку (новые записи). Только владелец может
              импортировать. Фото, дневник и чат из файла не переносятся.
              <div className="flex gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="min-h-11 px-4 rounded-lg bg-amber-600 text-white text-xs font-medium active:scale-95 transition-transform"
                >
                  Выбрать файл
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmImport(false)}
                  className="min-h-11 px-4 rounded-lg text-xs text-muted-foreground hover:bg-accent"
                >
                  Отмена
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
