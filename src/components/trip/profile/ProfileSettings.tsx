"use client";

import { useFeedbackUnread } from "@/hooks/use-feedback";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Bell, Check, ChevronDown, Crown, GraduationCap, KeyRound, Loader2, MessageSquarePlus, Monitor, Moon, Settings, Shield, Sparkles, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { LearningCenter } from "@/components/trip/onboarding/learning-center";
import { tourHref } from "@/lib/onboarding";
import type { UserProfile } from "./types";
import { PushToggle } from "./PushToggle";
import { InstallAppRow } from "./InstallApp";
import { PasswordField } from "@/components/auth/password-field";
import { AiKeyHelp } from "../ai-key-help";

interface ProfileSettingsProps {
  profile: UserProfile;
  setPremiumOpen: (v: boolean) => void;
  onReportBug: () => void;
  isAdmin: boolean;
  feedbackNew: number;
}

// Версия приложения подставляется при сборке (next.config.ts → package.json): раньше здесь была строка,
// которую приходилось менять руками при каждом релизе
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "—";

// Строка-кнопка списка настроек: одинаковые наведение, фокус с клавиатуры и «нажатие»
const ROW =
  "w-full flex items-center gap-3 p-3.5 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";

// Раскрывающийся блок: высота плавно ведётся через grid-template-rows (0fr → 1fr), без измерений в JS.
// Содержимое монтируется при первом открытии и остаётся (закрытие тоже анимируется), пока закрыто — inert:
// поля не берут фокус и не читаются скринридером. До первого открытия поля пароля не создаются вовсе —
// иначе менеджеры паролей подставляли бы сохранённый пароль в «скрытое» поле «Текущий пароль»
function Collapse({ open, id, children }: { open: boolean; id: string; children: React.ReactNode }) {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {open || shown ? children : null}
      </div>
    </div>
  );
}

const THEME_OPTIONS = [
  { value: "system", icon: Monitor, label: "Системная" },
  { value: "light", icon: Sun, label: "Светлая" },
  { value: "dark", icon: Moon, label: "Тёмная" },
] as const;

export function ProfileSettings({ profile, setPremiumOpen, onReportBug, isAdmin, feedbackNew }: ProfileSettingsProps) {
  const { data: feedbackUnread = 0 } = useFeedbackUnread(true);
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : "system";
  const currentLabel = THEME_OPTIONS.find((t) => t.value === current)?.label ?? "Системная";

  // === Обучение: Центр обучения (туры по разделам, продолжение, подсказки, сброс) ===
  const [learningOpen, setLearningOpen] = useState(false);

  // === Свой ключ ИИ (BYOK): ключ + опционально свой адрес провайдера и модель ===
  // ?ai=1 — переход с вкладки AI («Ввести ключ в профиле»): блок ключа открыт и в поле зрения.
  // Компонент рисуется после загрузки профиля на клиенте, поэтому чтение адреса не расходится с серверной разметкой
  const [aiOpen, setAiOpen] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ai") === "1"
  );
  // Пришли по ?ai=1 — подводим блок ключа под глаза (он ниже первого экрана)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("ai") === "1") {
      document.getElementById("ai-key")?.scrollIntoView({ block: "start" });
    }
  }, []);
  const [aiKey, setAiKey] = useState("");
  const [aiTail, setAiTail] = useState(profile.aiKeyTail ?? null);
  const [aiBase, setAiBase] = useState(profile.aiBaseUrl ?? "");
  const [aiModel, setAiModel] = useState(profile.aiModel ?? "");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiChecking, setAiChecking] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const checkAiKey = async () => {
    setAiChecking(true);
    try {
      const r = await fetch("/api/user/ai-key-check", { method: "POST" });
      const b = await r.json().catch(() => ({}));
      setAiStatus(
        b.ok
          ? { ok: true, message: `Ключ работает — модель «${b.model}» отвечает` }
          : { ok: false, message: b.error || `Ошибка ${r.status}` }
      );
    } catch {
      setAiStatus({ ok: false, message: "Не удалось выполнить проверку" });
    } finally {
      setAiChecking(false);
    }
  };

  const saveAiKey = async (value: string | null, check = false) => {
    setAiSaving(true);
    try {
      // Адрес/модель сохраняются всегда; ключ — только если введён (или null = убрать).
      // Так правка адреса не требует повторной вставки ключа.
      const payload: Record<string, unknown> = {
        aiBaseUrl: aiBase.trim() || null,
        aiModel: aiModel.trim() || null,
      };
      if (value === null) payload.aiApiKey = null;
      else if (value.trim()) payload.aiApiKey = value.trim();
      const r = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `Ошибка ${r.status}`);
      setAiTail(b.aiKeyTail ?? null);
      setAiKey("");
      toast.success(value === null ? "Ключ ИИ удалён" : "Настройки ИИ сохранены");
      setAiStatus(null);
      if (value === null) {
        setAiOpen(false);
      } else if (check) {
        await checkAiKey();
      }
    } catch (err) {
      toast.error("Не удалось сохранить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    } finally {
      setAiSaving(false);
    }
  };

  // === Смена пароля ===
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  // Та же политика, что на сервере: ≥8 символов, буквы и цифры
  const checkPassword = (p: string) => p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);

  const changePassword = async () => {
    if (pwdSaving) return;
    if (!currentPassword) {
      toast.error("Введите текущий пароль");
      return;
    }
    if (!checkPassword(newPassword)) {
      toast.error("Новый пароль: минимум 8 символов, буквы и цифры");
      return;
    }
    if (newPassword !== pwdConfirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    setPwdSaving(true);
    try {
      const r = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `Ошибка ${r.status}`);
      toast.success("Пароль изменён. Другие устройства вышли из аккаунта");
      setCurrentPassword("");
      setNewPassword("");
      setPwdConfirm("");
      setPwdOpen(false);
    } catch (err) {
      toast.error("Не удалось изменить пароль", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl bg-card border border-border overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Settings className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Настройки</h3>
      </div>

      <div className="divide-y divide-border">
        {/* Тема — сегментированный переключатель */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            {current === "dark" ? <Moon className="size-4.5" /> : current === "light" ? <Sun className="size-4.5" /> : <Monitor className="size-4.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Тема</div>
            <div className="text-xs text-muted-foreground">{mounted ? currentLabel : "…"}</div>
          </div>
          <div
            role="radiogroup"
            aria-label="Тема оформления"
            className="flex gap-1 rounded-xl bg-muted p-1 shrink-0"
          >
            {THEME_OPTIONS.map((t) => {
              const Icon = t.icon;
              const active = current === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={t.label}
                  title={t.label}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "size-10 rounded-lg grid place-items-center outline-none transition-[background-color,box-shadow,color] duration-150 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
                    active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Подписка */}
        <button
          type="button"
          onClick={() => setPremiumOpen(true)}
          className={ROW}
        >
          <div
            className={cn(
              "size-9 rounded-xl grid place-items-center shrink-0",
              profile.isPremium ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-secondary"
            )}
          >
            <Crown className={cn("size-4.5", profile.isPremium ? "text-white" : "text-muted-foreground")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Подписка</div>
            <div className="text-xs text-muted-foreground">
              {profile.isPremium
                ? `Premium · до ${profile.planExpiry ? new Date(profile.planExpiry).toLocaleDateString("ru-RU") : "∞"}`
                : "Free план — расширить лимиты"}
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
        </button>

        {/* Push-уведомления */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            <Bell className="size-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Push-уведомления</div>
            <div className="text-xs text-muted-foreground">Оповещения о поездках</div>
          </div>
          <PushToggle />
        </div>

        {/* Установить как приложение: Android — родной диалог, iOS/in-app — инструкция.
            В установленном виде строка исчезает сама, поэтому не бросается в глаза */}
        <InstallAppRow />

        {/* Свой ключ ИИ — BYOK: переводчик фраз, советы шефа, ИИ-рассказ */}
        <div id="ai-key" className="scroll-mt-20">
          <button
            type="button"
            onClick={() => setAiOpen((v) => !v)}
            className={ROW}
            aria-expanded={aiOpen}
            aria-controls="ai-key-panel"
          >
            <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
              <Sparkles className="size-4.5 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Ключ ИИ</div>
              <div className="text-xs text-muted-foreground">
                {aiTail ? `Свой ключ подключён (${aiTail})` : "Подключить свой ключ для ИИ-функций"}
              </div>
            </div>
            <ChevronDown className={cn("size-4 text-muted-foreground shrink-0 transition-transform duration-200 motion-reduce:transition-none", aiOpen && "rotate-180")} />
          </button>
          <Collapse open={aiOpen} id="ai-key-panel">
            <div className="px-3.5 pb-3.5 space-y-2">
              {/* Подписи — только для скринридера: плейсхолдер исчезает при вводе и подписью не считается.
                  input-mobile = 16px, чтобы iOS не увеличивал страницу при фокусе */}
              <input
                type="password"
                name="ai-api-key"
                aria-label="Ключ ИИ-провайдера"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="input-mobile w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  name="ai-base-url"
                  aria-label="Адрес провайдера (Base URL)"
                  inputMode="url"
                  value={aiBase}
                  onChange={(e) => setAiBase(e.target.value)}
                  placeholder="Base URL — https://…/v1"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="input-mobile w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
                <input
                  name="ai-model"
                  aria-label="Модель"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="Модель — glm-4.6, gpt-4o-mini…"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="input-mobile w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
              </div>
              <AiKeyHelp />
              <p className="text-[10px] text-muted-foreground leading-snug">
                Ключ хранится в базе и наружу не отдаётся: его видите только вы (последние символы — для проверки).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => saveAiKey(aiKey, true)}
                  disabled={aiSaving || aiChecking || (!aiKey.trim() && aiBase.trim() === (profile.aiBaseUrl ?? "") && aiModel.trim() === (profile.aiModel ?? ""))}
                  className="min-h-10 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
                >
                  {aiSaving ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  Сохранить и проверить
                </button>
                {aiTail && (
                  <>
                    <button
                      type="button"
                      onClick={checkAiKey}
                      disabled={aiSaving || aiChecking}
                      className="min-h-10 rounded-lg bg-secondary border border-border px-3 text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                    >
                      {aiChecking ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      Проверить
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAiKey(null)}
                      disabled={aiSaving || aiChecking}
                      className="min-h-10 rounded-lg bg-secondary px-3 text-xs text-destructive font-medium flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-3" /> Убрать
                    </button>
                  </>
                )}
              </div>
              {aiStatus && (
                <p
                  className={cn(
                    "text-[11px] leading-snug rounded-lg px-2.5 py-2",
                    aiStatus.ok ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"
                  )}
                  role="status"
                >
                  {aiStatus.ok ? "✓ " : "⚠ "}
                  {aiStatus.message}
                </p>
              )}
            </div>
          </Collapse>
        </div>

        {/* Смена пароля: текущее устройство остаётся, прочие сессии выходят */}
        <div>
          <button
            type="button"
            onClick={() => setPwdOpen((v) => !v)}
            className={ROW}
            aria-expanded={pwdOpen}
            aria-controls="password-panel"
          >
            <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
              <KeyRound className="size-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Безопасность</div>
              <div className="text-xs text-muted-foreground">Сменить пароль для входа</div>
            </div>
            <ChevronDown className={cn("size-4 text-muted-foreground shrink-0 transition-transform duration-200 motion-reduce:transition-none", pwdOpen && "rotate-180")} />
          </button>
          <Collapse open={pwdOpen} id="password-panel">
            <div className="px-3.5 pb-3.5 space-y-2">
              <div>
                <label htmlFor="pwd-current" className="text-[11px] text-muted-foreground mb-1 block">Текущий пароль</label>
                <PasswordField
                  id="pwd-current"
                  name="current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label htmlFor="pwd-new" className="text-[11px] text-muted-foreground mb-1 block">Новый пароль</label>
                <PasswordField
                  id="pwd-new"
                  name="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  status={newPassword ? checkPassword(newPassword) : undefined}
                  describedBy={newPassword && !checkPassword(newPassword) ? "pwd-new-hint" : undefined}
                />
                {newPassword && !checkPassword(newPassword) && (
                  <p id="pwd-new-hint" className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Минимум 8 символов, буквы и цифры</p>
                )}
              </div>
              <div>
                <label htmlFor="pwd-confirm" className="text-[11px] text-muted-foreground mb-1 block">Подтвердите новый пароль</label>
                <PasswordField
                  id="pwd-confirm"
                  name="confirm-password"
                  value={pwdConfirm}
                  onChange={setPwdConfirm}
                  autoComplete="new-password"
                  status={pwdConfirm ? pwdConfirm === newPassword : undefined}
                  describedBy={pwdConfirm && pwdConfirm !== newPassword ? "pwd-confirm-hint" : undefined}
                  onKeyDown={(e) => e.key === "Enter" && changePassword()}
                />
                {pwdConfirm && pwdConfirm !== newPassword && (
                  <p id="pwd-confirm-hint" role="alert" className="text-[11px] text-destructive mt-1">Пароли не совпадают</p>
                )}
              </div>
              <button
                type="button"
                onClick={changePassword}
                disabled={pwdSaving || !currentPassword || !newPassword || !pwdConfirm}
                className="min-h-10 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
              >
                {pwdSaving ? <Loader2 className="size-3 animate-spin" /> : <KeyRound className="size-3" />}
                Изменить пароль
              </button>
              <p className="text-[11px] text-muted-foreground leading-snug text-pretty">
                После смены пароля со всех других устройств произойдёт выход из аккаунта.
              </p>
            </div>
          </Collapse>
        </div>

        {/* Обучение — Центр обучения */}
        <button
          type="button"
          onClick={() => setLearningOpen(true)}
          className={ROW}
        >
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            <GraduationCap className="size-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Обучение</div>
            <div className="text-xs text-muted-foreground">Туры по разделам, подсказки, пройти заново</div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
        </button>
        <LearningCenter
          open={learningOpen}
          onOpenChange={setLearningOpen}
          onWatch={(id) => {
            setLearningOpen(false);
            router.push(tourHref(id));
          }}
          onReset={() => router.push("/")}
        />

        {/* Обратная связь */}
        <button
          type="button"
          onClick={onReportBug}
          className={ROW}
        >
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            <MessageSquarePlus className="size-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Обратная связь</div>
            <div className="text-xs text-muted-foreground">Баг, идея, вопрос, жалоба или отзыв</div>
          </div>
          {feedbackUnread > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shrink-0">
              новый ответ
            </span>
          )}
          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
        </button>

        {/* Админ-панель — только для роли admin */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className={ROW}
          >
            <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
              <Shield className="size-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Админ-панель</div>
              <div className="text-xs text-muted-foreground">Юзеры, поездки, отзывы</div>
            </div>
            {feedbackNew > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold grid place-items-center shrink-0">
                {feedbackNew}
              </span>
            )}
            <ArrowRight className="size-4 text-muted-foreground shrink-0" />
          </button>
        )}

        {/* Версия */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            <span className="text-base">🧳</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">TripTrek</div>
            <div className="text-xs text-muted-foreground tabular-nums">Версия {APP_VERSION}</div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
