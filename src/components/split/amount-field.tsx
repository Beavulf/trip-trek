"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CURRENCIES, currencySymbol } from "@/lib/currencies";
import { convertCents, exchangeRate, formatRate } from "@/lib/split/fx";
import { centsToInput, parseAmountToCents } from "@/lib/split/money";
import { useCurrency } from "@/hooks/trip/use-currency";

// Сумма траты с выбором валюты. Группа ведёт долги в своей валюте (Br), но трату можно внести в другой — «аренда
// 500 $»: форма пересчитывает по курсу, показывает курс и даёт поправить сумму в валюте группы вручную (реальный курс
// обмена у друзей редко совпадает с курсом API). В трату уходит пересчитанная сумма + то, что ввели (original).

interface Seed {
  amountCents: number;
  originalAmountCents: number | null;
  originalCurrency: string | null;
}

export function useAmountField(groupCurrency: string, seed: Seed | null) {
  const fx = useCurrency();
  const rates = fx.data?.rates;
  const [amountStr, setAmountStr] = useState(seed ? centsToInput(seed.originalAmountCents ?? seed.amountCents) : "");
  const [currency, setCurrency] = useState(seed?.originalCurrency ?? groupCurrency);
  const [convStr, setConvStr] = useState(seed?.originalCurrency ? centsToInput(seed.amountCents) : "");
  // Своя сумма в валюте группы: при правке сохранённой иностранной траты пересчёт не трогаем, пока не изменят сумму/валюту
  const [convTouched, setConvTouched] = useState(!!seed?.originalCurrency);

  const foreign = currency !== groupCurrency;
  const typedCents = parseAmountToCents(amountStr) ?? 0;
  const amountInvalid = amountStr.trim() !== "" && parseAmountToCents(amountStr) === null;
  const autoConv = foreign ? convertCents(typedCents, currency, groupCurrency, rates) : null;
  const convParsed = parseAmountToCents(convStr);
  const convInvalid = foreign && convTouched && convStr.trim() !== "" && convParsed === null;
  const amountCents = !foreign ? typedCents : convTouched ? (convParsed ?? 0) : (autoConv ?? 0);

  const apiRate = foreign ? exchangeRate(currency, groupCurrency, rates) : null;
  const effectiveRate = foreign && typedCents > 0 && amountCents > 0 ? amountCents / typedCents : null;
  const approx =
    foreign &&
    apiRate !== null &&
    (fx.data?.fallback === true ||
      fx.data?.approxCodes?.includes(currency) === true ||
      fx.data?.approxCodes?.includes(groupCurrency) === true);

  return {
    foreign,
    currency,
    amountStr,
    typedCents,
    amountInvalid,
    /** Сумма в валюте ГРУППЫ — с ней работают деление, баланс и сервер */
    amountCents,
    convInvalid,
    convTouched,
    /** Что показывать в поле «в валюте группы»: своё значение или авто-пересчёт */
    convDisplay: convTouched ? convStr : autoConv !== null && autoConv > 0 ? centsToInput(autoConv) : "",
    apiRate,
    effectiveRate,
    approx,
    ratesLoading: foreign && apiRate === null && fx.isLoading,
    ratesUnavailable: foreign && apiRate === null && !fx.isLoading,
    refetchRates: () => void fx.refetch(),
    original: foreign && typedCents > 0 ? { amountCents: typedCents, currency } : null,
    setAmountStr: (v: string) => {
      setAmountStr(v);
      setConvTouched(false);
    },
    setCurrency: (c: string) => {
      setCurrency(c);
      setConvTouched(false);
      setConvStr("");
    },
    setConvStr: (v: string) => {
      setConvStr(v);
      setConvTouched(true);
    },
    resetConv: () => {
      setConvTouched(false);
      setConvStr("");
    },
  };
}

export type AmountField = ReturnType<typeof useAmountField>;

const flagOf = (code: string) => CURRENCIES.find((c) => c.code === code)?.flag ?? "🏳️";

export function AmountFieldView({ field, groupCurrency, autoFocus }: { field: AmountField; groupCurrency: string; autoFocus: boolean }) {
  const f = field;
  const groupSym = currencySymbol(groupCurrency).trim();
  const sym = currencySymbol(f.currency).trim();
  // Группа первой, дальше остальные; код вне списка (старая трата) остаётся доступным
  const codes = [groupCurrency, ...CURRENCIES.map((c) => c.code as string).filter((c) => c !== groupCurrency)];
  if (!codes.includes(f.currency)) codes.push(f.currency);

  return (
    <div>
      <label htmlFor="split-amount" className="text-xs text-muted-foreground mb-1 block">
        Сумма
      </label>
      <div className="flex items-end gap-2">
        <input
          id="split-amount"
          autoFocus={autoFocus}
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          value={f.amountStr}
          onChange={(e) => f.setAmountStr(e.target.value)}
          placeholder="0"
          aria-invalid={f.amountInvalid}
          className={cn(
            "w-full min-w-0 bg-transparent border-0 border-b-2 border-input rounded-none px-0 py-1 text-4xl font-bold tabular-nums input-mobile",
            "focus:outline-none focus:border-primary transition-colors",
            f.amountInvalid && "border-destructive"
          )}
        />
        <div className="relative shrink-0 pb-1">
          <select
            value={f.currency}
            onChange={(e) => f.setCurrency(e.target.value)}
            aria-label="Валюта траты"
            className={cn(
              "appearance-none w-[6.5rem] rounded-xl border bg-background pl-3 pr-2 min-h-11 text-base font-semibold input-mobile focus:outline-none focus:ring-2 focus:ring-ring/40",
              f.foreign ? "border-primary/50 text-foreground" : "border-input text-muted-foreground"
            )}
          >
            {codes.map((c) => (
              <option key={c} value={c}>
                {flagOf(c)} {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {f.amountInvalid && <p className="text-xs text-destructive mt-1">Сумма — число, не больше двух знаков после запятой</p>}

      {/* Пересчёт в валюту группы: долги считаются в ней */}
      {f.foreign && (
        <div className="mt-2 rounded-xl bg-muted/50 px-3 py-2.5 space-y-1.5" role="group" aria-label={`Пересчёт в ${groupCurrency}`}>
          <div className="flex items-center gap-2">
            <label htmlFor="split-converted" className="text-xs text-muted-foreground shrink-0">
              В {groupCurrency}
            </label>
            <input
              id="split-converted"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={f.convDisplay}
              onChange={(e) => f.setConvStr(e.target.value)}
              placeholder="0"
              aria-invalid={f.convInvalid}
              className={cn(
                "flex-1 min-w-0 text-right bg-card rounded-lg border border-input px-2.5 py-1.5 text-lg font-semibold tabular-nums input-mobile focus:outline-none focus:ring-2 focus:ring-ring/40",
                f.convInvalid && "border-destructive"
              )}
            />
            <span className="text-base font-semibold text-muted-foreground w-8">{groupSym}</span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground" role="status">
            {f.ratesLoading ? (
              <>Загружаем курс…</>
            ) : f.ratesUnavailable && !f.convTouched ? (
              <>
                Курс {f.currency} недоступен — впиши сумму в {groupCurrency} сам или{" "}
                <button type="button" onClick={f.refetchRates} className="underline font-medium text-foreground">
                  повтори
                </button>
              </>
            ) : f.convTouched ? (
              <>
                {f.effectiveRate !== null ? `Твой курс: 1 ${sym} = ${formatRate(f.effectiveRate)} ${groupSym}` : "Сумма введена вручную"}
                {f.apiRate !== null && (
                  <>
                    {" · "}
                    <button type="button" onClick={f.resetConv} className="underline font-medium text-foreground">
                      по курсу {formatRate(f.apiRate)}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {f.apiRate !== null && `По курсу 1 ${sym} = ${formatRate(f.apiRate)} ${groupSym}. `}
                Можно поправить, если считали по другому курсу.
                {f.approx && <span className="text-amber-600 dark:text-amber-400"> Курс приблизительный.</span>}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
