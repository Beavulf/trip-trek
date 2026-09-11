"use client";

// Вкладка «Настройки»: общий ключ ИИ для всех пользователей без своего.
// Ключ наружу не отдаётся — после сохранения виден только замаскированный хвост.

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function SettingsTab() {
  const [tail, setTail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/settings");
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || `Ошибка ${r.status}`);
        if (alive) setTail(b.aiKeyTail ?? null);
      } catch (err) {
        if (alive) toast.error("Не удалось загрузить настройки", { description: err instanceof Error ? err.message : undefined });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (value: string | null) => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiApiKey: value }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `Ошибка ${r.status}`);
      setTail(b.aiKeyTail ?? null);
      setKey("");
      setConfirmClear(false);
      toast.success(value === null ? "Общий ключ ИИ убран" : "Общий ключ ИИ сохранён");
    } catch (err) {
      toast.error("Не удалось сохранить", { description: err instanceof Error ? err.message : "Попробуйте ещё раз" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-indigo-500" />
          <h2 className="font-semibold text-sm">Общий ключ ИИ</h2>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">{tail ?? "не задан"}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          OpenAI-совместимый ключ для ИИ-функций (фразы, переводы, советы шефа, рассказ о поездке).
          Используется теми, у кого нет собственного ключа; приоритет — всегда свой ключ пользователя.
          Базовый URL и модель берутся из переменных окружения <span className="font-mono">OPENAI_BASE_URL</span> /{" "}
          <span className="font-mono">OPENAI_MODEL</span>.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save(key)}
            disabled={!key.trim() || saving}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <KeyRound className="size-3" />}
            Сохранить
          </button>
          {tail && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-red-500"
            >
              <Trash2 className="size-3" /> Убрать
            </button>
          )}
          {confirmClear && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => save(null)}
                disabled={saving}
                className="min-h-10 rounded-lg bg-red-500 px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                Точно убрать
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-10 rounded-lg bg-secondary px-3 text-xs"
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Ключ хранится в базе и никогда не возвращается клиенту — только замаскированный хвост.
      </p>
    </div>
  );
}
