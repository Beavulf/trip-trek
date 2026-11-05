"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, ExternalLink, Globe, Heart, MessageSquare, Server, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { hasSupportOptions, type SupportOptions } from "@/lib/support";

// «Поддержать TripTrek» внизу профиля: карточка-приглашение и окно с текстом и способами.
// Реквизиты задаёт админ (Настройки → Поддержка); не заданы — блока нет вовсе. Деньги идут напрямую
// на сторонние сервисы (DonationAlerts, WebMoney): приложение платёжных данных не получает и не хранит.
// Донат добровольный и ничего не открывает: тон просьбы — благодарность, без давления.

function useSupportOptions() {
  return useQuery<SupportOptions>({
    queryKey: ["support-options"],
    queryFn: async () => {
      const r = await fetch("/api/support");
      if (!r.ok) throw new Error("fetch support failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const WHERE_MONEY_GOES = [
  { icon: Server, text: "Сервер и хранение ваших фото" },
  { icon: Globe, text: "Домен и почта, чтобы приходили письма" },
  { icon: Sparkles, text: "Время на новые функции и исправления" },
] as const;

interface WebMoneyCheckoutForm {
  action: string;
  fields: Record<string, string>;
}

function isWebMoneyCheckoutForm(value: unknown): value is WebMoneyCheckoutForm {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.action !== "string" || typeof record.fields !== "object" || record.fields === null) return false;
  return Object.values(record.fields).every((field) => typeof field === "string");
}

export function SupportCard({ onReportBug, userEmail }: { onReportBug: () => void; userEmail?: string }) {
  const { data } = useSupportOptions();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [merchantAmount, setMerchantAmount] = useState("5");
  const [startingPayment, setStartingPayment] = useState(false);
  const reduceMotion = useReducedMotion();

  // Не заданы реквизиты (или ещё грузятся) — ничего не рисуем, чтобы не мигать пустым блоком
  if (!hasSupportOptions(data)) return null;

  const copyPurse = async () => {
    if (!data.webmoneyPurse) return;
    if (await copyText(data.webmoneyPurse)) {
      setCopied(true);
      toast.success("Кошелёк скопирован", { description: "Вставьте его в WebMoney при переводе в WMZ" });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Не удалось скопировать", { description: "Выделите номер кошелька и скопируйте вручную" });
    }
  };

  const startMerchantPayment = async () => {
    setStartingPayment(true);
    try {
      const response = await fetch("/api/payments/webmoney/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: merchantAmount }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Не удалось создать платёж";
        throw new Error(message);
      }
      if (!isWebMoneyCheckoutForm(result)) {
        throw new Error("Сервер вернул некорректную форму WebMoney");
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = result.action;
      form.acceptCharset = "UTF-8";
      for (const [name, value] of Object.entries(result.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      toast.error("Не удалось начать оплату", {
        description: error instanceof Error ? error.message : "Попробуйте ещё раз",
      });
      setStartingPayment(false);
    }
  };

  return (
    <>
      <motion.button
        id="tt-support-card"
        type="button"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-3xl border border-rose-500/25 bg-gradient-to-br from-orange-500/10 via-rose-500/10 to-violet-500/10 p-4 flex items-center gap-3 active:scale-[0.99] transition-transform hover:border-rose-500/40"
      >
        <span className="size-11 shrink-0 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-white grid place-items-center shadow-lg shadow-rose-500/25" aria-hidden="true">
          <Heart className="size-5 fill-current" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Поддержать TripTrek</span>
          <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
            Приложение делает один человек. Любая сумма — спасибо и помощь с сервером.
          </span>
        </span>
      </motion.button>

      <MobileBottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Поддержать проект"
        titleIcon={<Heart className="size-4 fill-rose-500 text-rose-500" />}
        maxWidthClass="sm:max-w-md"
      >
        <div className="space-y-5">
          {/* Приветствие: тёплый градиент и короткий честный текст */}
          <div className="rounded-3xl bg-gradient-to-br from-orange-500/15 via-rose-500/10 to-violet-500/15 border border-rose-500/20 px-4 py-5 text-center space-y-3">
            <motion.div
              animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto size-16 rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white grid place-items-center shadow-xl shadow-rose-500/30"
              aria-hidden="true"
            >
              <Heart className="size-8 fill-current" />
            </motion.div>
            <h3 className="text-lg font-bold leading-tight text-balance">Спасибо, что пользуетесь TripTrek</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Приложение делает один человек в свободное время. Оно бесплатное, и в бете так и останется. Если оно помогло вам
              собрать поездку и хочется сказать спасибо, любая сумма поддержит проект.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Куда идут деньги</p>
            <ul className="space-y-1.5">
              {WHERE_MONEY_GOES.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.text} className="flex items-center gap-2.5 text-sm">
                    <span className="size-8 shrink-0 rounded-xl bg-muted grid place-items-center" aria-hidden="true">
                      <Icon className="size-4 text-primary" />
                    </span>
                    {item.text}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground">Способы</p>

            {data.donationAlertsUrl && (
              <p className="text-xs text-muted-foreground leading-relaxed px-1">
                Для сопоставления укажите в сообщении email аккаунта
                {userEmail ? ` (${userEmail})` : ""}: приложение попробует найти совпадение и выдать бейдж. Это не подтверждает владение адресом;
                если привязка не сработала, напишите владельцу проекта.
              </p>
            )}
            {data.donationAlertsUrl && (
              <a
                href={data.donationAlertsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 min-h-14 hover:border-primary/40 active:scale-[0.99] transition-[border-color,transform] duration-150 ease-out motion-reduce:transition-none"
              >
                <span className="size-10 shrink-0 rounded-xl bg-amber-500/15 text-amber-500 grid place-items-center" aria-hidden="true">
                  <Heart className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">DonationAlerts</span>
                  <span className="block text-xs text-muted-foreground">Картой или другим удобным способом, разово или регулярно</span>
                </span>
                <ExternalLink className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
              </a>
            )}

            {data.webmoneyPurse && (
              <div className="rounded-2xl border border-border bg-card p-3.5 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="size-10 shrink-0 rounded-xl bg-sky-500/15 text-sky-500 grid place-items-center" aria-hidden="true">
                    <Wallet className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">WebMoney</span>
                    <span className="block text-xs text-muted-foreground">
                      {data.webmoneyMerchantEnabled
                        ? "Перевод вручную или оплата с автоматической привязкой"
                        : "Перевод на кошелёк WMZ (доллары)"}
                    </span>
                  </span>
                </div>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 min-w-0 rounded-xl bg-muted px-3 py-2.5 font-mono text-sm tracking-wide select-all break-all">
                    {data.webmoneyPurse}
                  </code>
                  <button
                    type="button"
                    onClick={copyPurse}
                    className="shrink-0 min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-medium text-primary-foreground active:scale-95 transition-transform"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Готово" : "Копировать"}
                  </button>
                </div>
                {data.webmoneyMerchantEnabled && (
                  <p className="text-[11px] text-muted-foreground">
                    Обычный перевод на кошелёк не подтвердится в приложении автоматически; для записи доната используйте оплату Merchant.
                  </p>
                )}
                {data.webmoneyMerchantEnabled && (
                  <>
                    <div className="flex items-center gap-2">
                      <label htmlFor="webmoney-support-amount" className="text-xs text-muted-foreground">
                        Сумма, USD
                      </label>
                      <input
                        id="webmoney-support-amount"
                        type="number"
                        inputMode="decimal"
                        min="1"
                        max="200"
                        step="0.01"
                        value={merchantAmount}
                        onChange={(event) => setMerchantAmount(event.target.value)}
                        className="min-h-11 w-28 rounded-xl border border-input bg-background px-3 text-sm tabular-nums"
                      />
                      <span className="text-[11px] text-muted-foreground">от $1 до $200</span>
                    </div>
                    <button
                      type="button"
                      onClick={startMerchantPayment}
                      disabled={startingPayment}
                      className="w-full min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {startingPayment ? "Переходим к WebMoney…" : "Оплатить через WebMoney"}
                    </button>
                    <p className="text-[11px] text-muted-foreground">
                      Merchant автоматически подтвердит оплату и привяжет её к вашему аккаунту — email и комментарий не нужны.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-muted/60 px-3.5 py-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
            <p>Это добровольно: ничего не закроется и не исчезнет, если вы не поддержите. Взамен ничего не обещаю, кроме искренней благодарности.</p>
            <p>Данные карты и кошелька обрабатывает платёжный сервис. TripTrek получает сумму и подтверждение оплаты, но не платёжные реквизиты.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onReportBug();
            }}
            className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <MessageSquare className="size-4" />
            Или просто напишите отзыв
          </button>
        </div>
      </MobileBottomSheet>
    </>
  );
}
