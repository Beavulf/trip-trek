import Link from "next/link";

// Мягкая 404 публичной страницы: ссылку выключили, ротировали или она неверна.
// Гость не должен видеть системную страницу ошибки — он ничего не сделал не так.

export default function PublicTripNotFound() {
  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground px-4">
      <div className="text-center space-y-3 max-w-sm">
        <div className="text-5xl select-none" aria-hidden>
          🧭
        </div>
        <h1 className="text-xl font-bold">Ссылка недействительна</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Похоже, владелец закрыл доступ или обновил ссылку. Попросите свежую — она откроет журнал поездки.
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
