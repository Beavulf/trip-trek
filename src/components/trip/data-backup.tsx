"use client";

import { useState, useRef } from "react";
import { Download, Upload, Loader2, Check, AlertTriangle, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function DataBackup() {
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleExport = async () => {
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("Экспорт не удался");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `triptrek-china-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Данные экспортированы! 📥");
    } catch {
      toast.error("Не удалось экспортировать");
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.app !== "TripTrek China") {
        throw new Error("Это не файл TripTrek");
      }
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Импорт не удался");
      await qc.invalidateQueries();
      toast.success("Данные импортированы! 📤");
      setConfirmImport(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      toast.error("Ошибка импорта: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Database className="size-4" /> Резервное копирование
      </h2>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        Сохраните все данные поездки (места, фото, траты, дневник, фразы, блюда) в JSON-файл.
        Можно импортировать обратно при необходимости.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {/* Экспорт */}
        <button
          onClick={handleExport}
          className="flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 border-border hover:border-primary/40 hover:bg-accent transition-colors group"
        >
          <Download className="size-6 text-primary group-hover:scale-110 transition-transform" />
          <span className="text-xs font-medium">Экспорт</span>
          <span className="text-[10px] text-muted-foreground">Скачать JSON</span>
        </button>

        {/* Импорт */}
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (confirmImport) {
                handleImportFile(f);
              } else {
                setConfirmImport(true);
              }
            }
          }}
        />
        <button
          onClick={() => {
            if (confirmImport) {
              inputRef.current?.click();
            } else {
              inputRef.current?.click();
            }
          }}
          disabled={importing}
          className={cn(
            "flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-colors group disabled:opacity-50",
            confirmImport ? "border-amber-500/40 bg-amber-500/5" : "border-border hover:border-primary/40 hover:bg-accent"
          )}
        >
          {importing ? (
            <Loader2 className="size-6 text-primary animate-spin" />
          ) : confirmImport ? (
            <AlertTriangle className="size-6 text-amber-500" />
          ) : (
            <Upload className="size-6 text-primary group-hover:scale-110 transition-transform" />
          )}
          <span className="text-xs font-medium">
            {importing ? "Импорт…" : confirmImport ? "Точно?" : "Импорт"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {confirmImport ? "Замена данных" : "Загрузить JSON"}
          </span>
        </button>
      </div>

      {/* Предупреждение при импорте */}
      <AnimatePresence>
        {confirmImport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-400"
          >
            ⚠️ <strong>Внимание:</strong> Импорт полностью заменит текущие данные.
            Сначала сделайте экспорт для резервной копии!
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="text-[11px] font-medium text-amber-600 hover:underline"
              >
                Продолжить
              </button>
              <button
                onClick={() => setConfirmImport(false)}
                className="text-[11px] text-muted-foreground hover:underline"
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
