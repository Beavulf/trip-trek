"use client";

// Что такое «ключ ИИ» и где его взять. Общего ключа в бете нет: ИИ-функции работают на ключе самого
// пользователя, поэтому объяснение стоит там, где человек упирается в его отсутствие (вкладка AI)
// и там, где ключ вводят (профиль). Примеры провайдеров — для ориентира, не реклама и не обязательство.

import Link from "next/link";
import { KeyRound } from "lucide-react";

const PROVIDERS = [
  { name: "OpenRouter", keysUrl: "https://openrouter.ai/keys", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { name: "OpenAI", keysUrl: "https://platform.openai.com/api-keys", baseUrl: null, model: "gpt-4o-mini" },
] as const;

export function AiKeyHelp({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          <b className="text-foreground">Что это.</b> Ключ ИИ — пароль для доступа к нейросети. ИИ-функции TripTrek (рассказ о
          поездке, планировщик маршрута, разговорник, советы шефа, места рядом) работают на вашем собственном ключе: вы сами
          выбираете нейросеть и платите ей напрямую. Общего ключа в бете нет.
        </p>
        <div>
          <b className="text-foreground">Где взять.</b>
          <ol className="list-decimal pl-5 mt-1 space-y-1">
            <li>
              Выберите сервис, который даёт доступ к нейросетям по API в формате OpenAI. Например{" "}
              {PROVIDERS.map((p, i) => (
                <span key={p.name}>
                  {i > 0 && ", "}
                  <a href={p.keysUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {p.name}
                  </a>
                </span>
              ))}
              .
            </li>
            <li>Зарегистрируйтесь, пополните баланс на пару долларов и создайте ключ — строку вида «sk-…». Один рассказ о поездке обычно стоит копейки.</li>
            <li>
              Вставьте ключ в Профиль → Ключ ИИ и нажмите «Сохранить и проверить». Если ключ не от OpenAI, укажите ещё адрес сервиса
              (Base URL) и модель, они есть в его документации.
            </li>
          </ol>
        </div>
        <div className="rounded-lg bg-muted/60 px-2.5 py-2 space-y-0.5">
          <div className="font-medium text-foreground">Для ориентира</div>
          {PROVIDERS.map((p) => (
            <div key={p.name} className="font-mono text-[10px] break-all">
              {p.name}: {p.baseUrl ? `Base URL ${p.baseUrl}, ` : "Base URL оставьте пустым, "}модель {p.model}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Карточка на вкладке AI, когда ключа нет: что это, где взять и кнопка к полю ввода в профиле. */
export function AiKeyCard() {
  return (
    <section className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3" aria-labelledby="ai-key-title">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-amber-500/15 grid place-items-center shrink-0" aria-hidden="true">
          <KeyRound className="size-4.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0">
          <h2 id="ai-key-title" className="text-sm font-semibold">Подключите свой ключ ИИ</h2>
          <p className="text-xs text-muted-foreground">Без него вы получите только черновик по данным поездки</p>
        </div>
      </div>
      <AiKeyHelp />
      <Link
        href="/profile?ai=1"
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform"
      >
        Ввести ключ в профиле
      </Link>
    </section>
  );
}
