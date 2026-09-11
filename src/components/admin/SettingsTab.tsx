"use client";

// Вкладка «Настройки»: общий ключ ИИ + адрес API + модель для всех пользователей
// без своего ключа. Ключ наружу не отдаётся — после сохранения виден только
// замаскированный хвост. ВАЖНО: ключ и Base URL должны быть от одного провайдера.

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PROVIDER_HINTS = [
  { name: "OpenAI", base: "— (оставь пустым)", model: "gpt-4o-mini" },
  { name: "Z.ai (GLM)", base: "https://api.z.ai/api/paas/v4", model: "glm-4.6" },
  { name: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "см. на сайте" },
  { name: "DeepSeek", base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
];

export function SettingsTab() {
  const [tail, setTail] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
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
        if (alive) {
          setTail(b.aiKeyTail ?? null);
          setBaseUrl(b.aiBaseUrl ?? "");
          setModel(b.aiModel ?? "");
        }
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

  const save = async (patch: { aiApiKey?: string | null; aiBaseUrl?: string; aiModel?: string }) => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `Ошибка ${r.status}`);
      setTail(b.aiKeyTail ?? null);
      setBaseUrl(b.aiBaseUrl ?? "");
      setModel(b.aiModel ?? "");
      setKey("");
      setConfirmClear(false);
      toast.success("Настройки ИИ сохранены");
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
          <h2 className="font-semibold text-sm">Общий ИИ</h2>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">{tail ?? "ключ не задан"}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Используется теми, у кого нет своего ключа (свой ключ из профиля всегда приоритетнее).
          Ключ и адрес API должны быть от <b>одного провайдера</b> — иначе API отбивает запросы 401.
        </p>

        <label className="block text-xs font-medium text-muted-foreground">Ключ API</label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono"
        />

        <label className="block text-xs font-medium text-muted-foreground">Base URL (адрес API провайдера)</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1 — если пусто"
          autoComplete="off"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono"
        />

        <label className="block text-xs font-medium text-muted-foreground">Модель</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o-mini — если пусто"
          autoComplete="off"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono"
        />

        <div className="rounded-xl bg-muted/40 border border-border p-2.5 text-[10px] text-muted-foreground space-y-1">
          {PROVIDER_HINTS.map((p) => (
            <div key={p.name} className="flex flex-wrap gap-x-2">
              <span className="font-semibold text-foreground/70 w-24 shrink-0">{p.name}</span>
              <span className="font-mono">{p.base}</span>
              <span className="font-mono text-muted-foreground/70">· {p.model}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save({ aiBaseUrl: baseUrl, aiModel: model, ...(key.trim() ? { aiApiKey: key } : {}) })}
            disabled={saving}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="size-3 animate-spin" />}
            Сохранить
          </button>
          {tail && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-red-500"
            >
              <Trash2 className="size-3" /> Убрать ключ
            </button>
          )}
          {confirmClear && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => save({ aiApiKey: null })}
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
