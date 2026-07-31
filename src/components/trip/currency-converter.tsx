"use client";

import { useCurrency } from "@/hooks/use-trip";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const CURRENCIES = [
  { code: "USD", flag: "🇺🇸", name: "Доллар США" },
  { code: "EUR", flag: "🇪🇺", name: "Евро" },
  { code: "GBP", flag: "🇬🇧", name: "Фунт" },
  { code: "CNY", flag: "🇨🇳", name: "Юань" },
  { code: "JPY", flag: "🇯🇵", name: "Иена" },
  { code: "KRW", flag: "🇰🇷", name: "Вона" },
  { code: "HKD", flag: "🇭🇰", name: "Гонконг$" },
  { code: "MOP", flag: "🇲🇴", name: "Патака" },
  { code: "THB", flag: "🇹🇭", name: "Бат" },
  { code: "VND", flag: "🇻🇳", name: "Донг" },
  { code: "SGD", flag: "🇸🇬", name: "Сингапур$" },
  { code: "RUB", flag: "🇷🇺", name: "Рубль" },
  { code: "BYN", flag: "🇧🇾", name: "Бел.рубль" },
  { code: "UAH", flag: "🇺🇦", name: "Гривна" },
  { code: "KZT", flag: "🇰🇿", name: "Тенге" },
  { code: "TRY", flag: "🇹🇷", name: "Лира" },
  { code: "AED", flag: "🇦🇪", name: "Дирхам" },
  { code: "INR", flag: "🇮🇳", name: "Рупия" },
  { code: "IDR", flag: "🇮🇩", name: "Рупия ID" },
  { code: "MYR", flag: "🇲🇾", name: "Ринггит" },
  { code: "PHP", flag: "🇵🇭", name: "Песо" },
  { code: "AUD", flag: "🇦🇺", name: "Австрал$" },
  { code: "CAD", flag: "🇨🇦", name: "Канад$" },
  { code: "CHF", flag: "🇨🇭", name: "Франк" },
];

export function CurrencyConverter() {
  const { data: rates, isLoading } = useCurrency();
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("CNY");

  const convert = (amt: number, f: string, t: string): number => {
    if (!rates?.rates[f] || !rates?.rates[t]) return 0;
    // Через USD: amount / fromRate * toRate
    const inUsd = amt / rates.rates[f];
    return inUsd * rates.rates[t];
  };

  const amountNum = parseFloat(amount) || 0;
  const result = convert(amountNum, from, to);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-border p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold mb-3">
        💱 Конвертер валют
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" /> Загрузка курсов…
        </div>
      ) : rates ? (
        <>
          <div className="space-y-2">
            {/* From */}
            <div className="flex gap-2">
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-2.5 text-sm w-28"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-right font-medium"
                placeholder="0"
              />
            </div>

            {/* Swap */}
            <div className="flex justify-center">
              <button
                onClick={swap}
                className="size-8 rounded-full bg-muted hover:bg-accent grid place-items-center transition-colors active:scale-90"
                title="Поменять местами"
              >
                <ArrowRight className="size-4 rotate-90" />
              </button>
            </div>

            {/* To */}
            <div className="flex gap-2">
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-2.5 text-sm w-28"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                ))}
              </select>
              <div className="flex-1 rounded-lg border border-input bg-muted/30 px-3 py-2.5 text-sm text-right font-bold">
                {result.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Курс */}
          <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
            <span>
              1 {from} = {convert(1, from, to).toFixed(2)} {to}
            </span>
            <span className={cn("flex items-center gap-1", rates.fallback && "text-amber-500")}>
              {rates.fallback ? "⚠ примерные курсы" : "🔄 обновлено"}
            </span>
          </div>

          {/* Быстрые суммы */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[10, 50, 100, 500, 1000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(String(v))}
                className="px-2.5 py-1 rounded-full text-[11px] bg-muted hover:bg-accent transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </motion.div>
  );
}
