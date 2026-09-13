"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  HardDrive,
  Loader2,
  PlugZap,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminStats } from "@/hooks/use-admin-stats";
import { fmtBytes } from "./shared";

// Настройки штаба: ИИ-провайдер (общий ключ + тест живым запросом),
// конфиг приложения (регистрация, лимиты free-плана), приборка хранилища
// и справка о системе. Ключ ИИ наружу не отдаётся — только маска.

// Пресеты провайдеров: клик заполняет Base URL и модель. Модель OpenRouter
// зависит от выбранного на их сайте — оставляем поле пустым.
const AI_PROVIDERS = [
  { name: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { name: "Z.ai (GLM)", base: "https://api.z.ai/api/paas/v4", model: "glm-4.6" },
  { name: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "" },
  { name: "DeepSeek", base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
];

const AI_SOURCE_LABEL: Record<string, string> = {
  admin: "ключ из настроек",
  env: "ключ из переменных окружения",
  user: "—",
  none: "ключ не задан",
};

const STORAGE_KINDS: { key: string; label: string }[] = [
  { key: "photo", label: "Фото поездок" },
  { key: "thumb", label: "Миниатюры" },
  { key: "avatar", label: "Аватарки" },
  { key: "food", label: "Блюда" },
  { key: "feedback", label: "Скриншоты отзывов" },
];

interface SettingsData {
  aiKeyTail: string | null;
  aiBaseUrl: string;
  aiModel: string;
  appConfig: {
    registrationEnabled: boolean;
    freeTripLimit: number;
    freeMemberLimit: number;
    aiAlertCallsPerDay: number;
    aiAlertTokensPerDay: number;
  };
}

interface TestResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  reply?: string;
  respondedModel?: string;
  baseUrl?: string;
  model?: string;
  source?: string;
}

interface OrphanRow {
  url: string;
  bytes: number;
  mtime: string;
}

function SectionCard({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      {hint && <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>}
      {children}
    </section>
  );
}

const inputCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring input-mobile";

export function SettingsTab() {
  const qc = useQueryClient();
  const { data: stats } = useAdminStats(true);

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const r = await fetch("/api/admin/settings");
      if (!r.ok) throw new Error("fetch settings failed");
      return r.json();
    },
  });

  // Локальные поля синхронизируются при приходе/обновлении settings — паттерн
  // «пересборка стейта при смене пропсы»: пока данные с сервера не меняются,
  // ввод пользователя не сбрасывается
  const [tail, setTail] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  // === Приложение ===
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [freeTripLimit, setFreeTripLimit] = useState("1");
  const [freeMemberLimit, setFreeMemberLimit] = useState("5");
  const [aiAlertCalls, setAiAlertCalls] = useState("0");
  const [aiAlertTokens, setAiAlertTokens] = useState("0");

  // === Хранилище ===
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [orphanUrls, setOrphanUrls] = useState<string[]>([]);

  const [syncKey, setSyncKey] = useState("");
  const settingsKey = settings
    ? [
        settings.aiKeyTail,
        settings.aiBaseUrl,
        settings.aiModel,
        settings.appConfig.registrationEnabled,
        settings.appConfig.freeTripLimit,
        settings.appConfig.freeMemberLimit,
        settings.appConfig.aiAlertCallsPerDay,
        settings.appConfig.aiAlertTokensPerDay,
      ].join("|")
    : "";
  if (settings && settingsKey !== syncKey) {
    setSyncKey(settingsKey);
    setTail(settings.aiKeyTail ?? null);
    setBaseUrl(settings.aiBaseUrl ?? "");
    setModel(settings.aiModel ?? "");
    setRegistrationEnabled(settings.appConfig.registrationEnabled);
    setFreeTripLimit(String(settings.appConfig.freeTripLimit));
    setFreeMemberLimit(String(settings.appConfig.freeMemberLimit));
    setAiAlertCalls(String(settings.appConfig.aiAlertCallsPerDay));
    setAiAlertTokens(String(settings.appConfig.aiAlertTokensPerDay));
  }

  const saveAi = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b as SettingsData;
    },
    onSuccess: (b) => {
      setTail(b.aiKeyTail ?? null);
      setKey("");
      setConfirmClear(false);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-journal"] });
      toast.success("Настройки ИИ сохранены");
    },
    onError: (e: Error) => toast.error("Не удалось сохранить", { description: e.message }),
  });

  const saveApp = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appConfig: {
            registrationEnabled,
            freeTripLimit: Number(freeTripLimit) || 0,
            freeMemberLimit: Number(freeMemberLimit) || 1,
            aiAlertCallsPerDay: Number(aiAlertCalls) || 0,
            aiAlertTokensPerDay: Number(aiAlertTokens) || 0,
          },
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b as SettingsData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-journal"] });
      toast.success("Конфиг приложения сохранён");
    },
    onError: (e: Error) => toast.error("Не удалось сохранить", { description: e.message }),
  });

  const runTest = useMutation({
    mutationFn: async (): Promise<TestResult> => {
      setTest(null);
      const r = await fetch("/api/admin/settings/test", { method: "POST" });
      return r.json().catch(() => ({ ok: false, error: `Ошибка ${r.status}` }));
    },
    onSuccess: setTest,
  });

  const scan = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/storage?scan=1");
      if (!r.ok) throw new Error("Сканирование не удалось");
      return (await r.json()) as { orphans?: OrphanRow[] };
    },
    onSuccess: (b) => setOrphanUrls((b.orphans || []).map((o) => o.url)),
    onError: (e: Error) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: async (urls: string[]) => {
      const r = await fetch("/api/admin/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Не удалось удалить");
      return b as { deleted: number };
    },
    onSuccess: (b) => {
      setConfirmPurge(false);
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-journal"] });
      scan.mutate();
      toast.success(`Удалено файлов: ${b.deleted}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !settings) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const appDirty =
    registrationEnabled !== settings.appConfig.registrationEnabled ||
    freeTripLimit !== String(settings.appConfig.freeTripLimit) ||
    freeMemberLimit !== String(settings.appConfig.freeMemberLimit) ||
    aiAlertCalls !== String(settings.appConfig.aiAlertCallsPerDay) ||
    aiAlertTokens !== String(settings.appConfig.aiAlertTokensPerDay);

  const usage = stats?.storage;
  const scanData = scan.data;

  return (
    <div className="space-y-4">
      {/* === ИИ-провайдер === */}
      <SectionCard
        icon={<Sparkles className="size-4 text-indigo-500" />}
        title="Общий ИИ"
        hint="Используется теми, у кого нет своего ключа (свой ключ из профиля всегда приоритетнее). Ключ и адрес API должны быть от одного провайдера — иначе API отбивает запросы 401."
      >
        <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>{AI_SOURCE_LABEL[stats?.health.ai.source || "none"]}</span>
          <span className="tabular-nums">{tail ?? "—"}</span>
        </div>

        <label className="block text-xs font-medium text-muted-foreground">Провайдер — клик подставит адрес и модель</label>
        <div className="flex flex-wrap gap-1.5">
          {AI_PROVIDERS.map((p) => {
            const on = baseUrl === p.base;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setBaseUrl(p.base);
                  if (p.model) setModel(p.model);
                }}
                className={cn(
                  "px-3 min-h-9 rounded-xl text-xs font-medium transition-colors",
                  on ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        <label className="block text-xs font-medium text-muted-foreground">Ключ API</label>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" autoComplete="off" className={inputCls} />

        <label className="block text-xs font-medium text-muted-foreground">Base URL (адрес API провайдера)</label>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1 — если пусто" autoComplete="off" className={inputCls} />

        <label className="block text-xs font-medium text-muted-foreground">Модель</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini — если пусто" autoComplete="off" className={inputCls} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveAi.mutate({ aiBaseUrl: baseUrl, aiModel: model, ...(key.trim() ? { aiApiKey: key } : {}) })}
            disabled={saveAi.isPending}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {saveAi.isPending && <Loader2 className="size-3 animate-spin" />}
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => runTest.mutate()}
            disabled={runTest.isPending}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-secondary border border-border px-4 text-xs font-medium disabled:opacity-50"
          >
            {runTest.isPending ? <Loader2 className="size-3 animate-spin" /> : <PlugZap className="size-3.5" />}
            Проверить подключение
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
                onClick={() => saveAi.mutate({ aiApiKey: null })}
                disabled={saveAi.isPending}
                className="min-h-10 rounded-lg bg-red-500 px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                Точно убрать
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className="min-h-10 rounded-lg bg-secondary px-3 text-xs">
                Отмена
              </button>
            </div>
          )}
        </div>

        {/* Результат теста */}
        {test && (
          <div
            className={cn(
              "rounded-xl border p-3 space-y-1 font-mono text-[11px] leading-relaxed",
              test.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              {test.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
              {test.ok ? `Подключение работает · ${test.latencyMs} мс` : "Не работает"}
            </div>
            {test.error && <p>{test.error}</p>}
            {test.ok && test.respondedModel && <p>модель ответила: {test.respondedModel}</p>}
            {test.ok && test.reply && <p className="opacity-80">ответ: «{test.reply}»</p>}
            {!test.ok && test.baseUrl && (
              <p className="opacity-80">
                адрес: {test.baseUrl} · модель: {test.model}
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {/* === Приложение === */}
      <SectionCard
        icon={<SlidersHorizontal className="size-4 text-violet-500" />}
        title="Приложение"
        hint="Правила для всех пользователей. Premium не ограничивается ничем из этого."
      >
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Регистрация открыта</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Выключи, чтобы новые аккаунты не создавались. Существующие входят как обычно.
            </p>
          </div>
          <Switch checked={registrationEnabled} onCheckedChange={setRegistrationEnabled} aria-label="Регистрация открыта" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Поездок у Free</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={freeTripLimit}
              onChange={(e) => setFreeTripLimit(e.target.value)}
              className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm tabular-nums input-mobile"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Участников у Free-владельца</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={freeMemberLimit}
              onChange={(e) => setFreeMemberLimit(e.target.value)}
              className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm tabular-nums input-mobile"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Алерты ИИ: вызовов/сутки</span>
            <input
              type="number"
              min={0}
              max={1000000}
              value={aiAlertCalls}
              onChange={(e) => setAiAlertCalls(e.target.value)}
              className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm tabular-nums input-mobile"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Алерты ИИ: токенов/сутки</span>
            <input
              type="number"
              min={0}
              max={1000000}
              value={aiAlertTokens}
              onChange={(e) => setAiAlertTokens(e.target.value)}
              className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm tabular-nums input-mobile"
            />
          </label>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-1">
          0 = алерт выключен. При превышении порога юзером придёт уведомление в колокольчик (не чаще раза в сутки).
        </p>

        <button
          type="button"
          disabled={!appDirty || saveApp.isPending}
          onClick={() => saveApp.mutate()}
          className="w-full min-h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          Сохранить конфиг приложения
        </button>
      </SectionCard>

      {/* === Хранилище === */}
      <SectionCard
        icon={<HardDrive className="size-4 text-emerald-500" />}
        title="Хранилище"
        hint="Файлы лежат на диске сервера. «Сироты» — файлы, на которые больше не ссылается база: остались от удалённых фото, отзывов или старых аватарок."
      >
        {usage ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black tabular-nums">{fmtBytes(usage.total)}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {usage.files} {usage.files === 1 ? "файл" : "файлов"}
              </span>
            </div>
            <div className="space-y-2">
              {STORAGE_KINDS.map((k) => {
                const kind = usage.byKind[k.key] || { bytes: 0, files: 0 };
                const pct = usage.total > 0 ? Math.round((kind.bytes / usage.total) * 100) : 0;
                return (
                  <div key={k.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{k.label}</span>
                      <span className="font-mono tabular-nums">{fmtBytes(kind.bytes)} · {kind.files}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500/70 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex justify-center py-3">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-secondary border border-border px-4 text-xs font-medium disabled:opacity-50"
          >
            {scan.isPending ? <Loader2 className="size-3 animate-spin" /> : <ScanSearch className="size-3.5" />}
            {scanData ? "Пересканировать" : "Найти сироты"}
          </button>
          {scanData && orphanUrls.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmPurge(true)}
              disabled={purge.isPending}
              className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-4 text-xs font-medium text-destructive disabled:opacity-50"
            >
              <Trash2 className="size-3" />
              Удалить {orphanUrls.length}
            </button>
          )}
        </div>

        {scanData && (
          <div>
            {orphanUrls.length === 0 ? (
              <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                Сирот нет — каждый файл на диске нужен базе.
              </p>
            ) : (
              <div className="rounded-xl border border-border divide-y divide-border max-h-56 overflow-y-auto">
                {(scanData.orphans || []).map((o) => (
                  <div key={o.url} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-mono text-[10px] text-muted-foreground truncate flex-1" title={o.url}>
                      {o.url.replace("/uploads/", "")}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{fmtBytes(o.bytes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
          <AlertDialogContent className="max-w-sm rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить {orphanUrls.length} файлов-сирот?</AlertDialogTitle>
              <AlertDialogDescription>
                Перед удалением панель перепроверит, что на эти файлы по-прежнему нет ссылок в базе. Действие необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="mt-0 rounded-xl">Оставить</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  purge.mutate(orphanUrls);
                }}
                className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              >
                {purge.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionCard>

      {/* === Система === */}
      {stats && (
        <SectionCard icon={<span className="text-base">🛂</span>} title="Система">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: "Версия", value: `v${stats.health.version}` },
              { label: "Режим", value: stats.health.nodeEnv },
              { label: "Node", value: stats.health.nodeVersion },
              { label: "База", value: `${stats.health.dbLatencyMs} мс` },
              { label: "ИИ-адрес", value: stats.health.ai.baseUrl || "по умолчанию" },
              { label: "ИИ-модель", value: stats.health.ai.model || "по умолчанию" },
              { label: "Push", value: stats.health.vapid ? "настроен" : "выключен" },
              { label: "Аптайм", value: `${Math.floor(stats.health.uptimeSec / 3600)} ч ${Math.floor((stats.health.uptimeSec % 3600) / 60)} мин` },
            ].map((r) => (
              <div key={r.label} className="rounded-xl bg-secondary/50 px-3 py-2.5">
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{r.label}</div>
                <div className="font-mono text-xs font-semibold mt-0.5 truncate" title={r.value}>
                  {r.value}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
