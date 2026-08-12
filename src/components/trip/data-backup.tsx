"use client";

import { useState, useRef } from "react";
import { Download, Upload, Loader2, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";

export function DataBackup() {
  const tripId = useCurrentTripId();
  const { setTripSwitcherOpen } = useTripStore();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

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
      <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Database className="size-4" /> Резервное копирование
      </h2>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        Экспорт скачивает JSON поездки. Импорт добавляет маршрут, траты, фразы, еду и чек-лист в текущую поездку
        (новые id). Фото, дневник и чат из файла не восстанавливаются.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || importing}
          aria-label="Экспортировать данные поездки"
          className="min-h-[72px] flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 border-border hover:border-primary/40 hover:bg-accent transition-colors group disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="size-6 text-primary animate-spin" />
          ) : (
            <Download className="size-6 text-primary group-hover:scale-110 transition-transform" />
          )}
          <span className="text-xs font-medium">{exporting ? "Экспорт…" : "Экспорт"}</span>
          <span className="text-[10px] text-muted-foreground">Скачать JSON</span>
        </button>

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
          disabled={importing || exporting}
          aria-label="Импортировать данные из JSON"
          className={cn(
            "min-h-[72px] flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-colors group disabled:opacity-50",
            confirmImport ? "border-amber-500/40 bg-amber-500/5" : "border-border hover:border-primary/40 hover:bg-accent"
          )}
        >
          {importing ? (
            <Loader2 className="size-6 text-primary animate-spin" />
          ) : (
            <Upload className="size-6 text-primary group-hover:scale-110 transition-transform" />
          )}
          <span className="text-xs font-medium">{importing ? "Импорт…" : "Импорт"}</span>
          <span className="text-[10px] text-muted-foreground">Загрузить JSON</span>
        </button>
      </div>

      <AnimatePresence>
        {confirmImport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-400"
          >
            ⚠️ <strong>Внимание:</strong> данные добавятся в текущую поездку. Только владелец может импортировать.
            Фото/дневник из бэкапа не переносятся.
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="min-h-11 px-3 rounded-lg bg-amber-600 text-white text-xs font-medium"
              >
                Продолжить
              </button>
              <button
                type="button"
                onClick={() => setConfirmImport(false)}
                className="min-h-11 px-3 rounded-lg text-xs text-muted-foreground"
              >
                Отмена
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
