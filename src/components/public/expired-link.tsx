import Link from "next/link";

// Публичная ссылка существует, но срок её действия вышел. Отдельный экран, а не «недействительна»:
// гость должен понять, что ссылка не сломана, а у владельца нужно попросить продление.
// Название поездки и фото не показываем — страница закрыта целиком.

export function ExpiredLink() {
  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground px-4">
      <div className="text-center space-y-3 max-w-sm">
        <div className="text-5xl select-none" aria-hidden>
          ⏳
        </div>
        <h1 className="text-xl font-bold">Срок действия ссылки закончился</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Владелец открыл журнал поездки на ограниченное время. Попросите его продлить доступ — ссылка
          останется той же и снова заработает.
        </p>
        <Link
          href="/"
          className="inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Что такое TripTrek →
        </Link>
      </div>
    </main>
  );
}
