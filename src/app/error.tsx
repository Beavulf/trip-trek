"use client";

// Error boundary приложения: без стека и деталей наружу, с кнопкой восстановления
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">🧭</div>
        <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Страница не загрузилась. Попробуйте ещё раз — поездка и все данные на месте.
        </p>
        {error.digest && (
          <p className="text-[10px] text-muted-foreground/60">код: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="min-h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
