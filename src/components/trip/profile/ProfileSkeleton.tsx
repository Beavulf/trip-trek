import { Skeleton } from "@/components/ui/skeleton";

// Каркас профиля на время загрузки: те же карточки и высоты, что у настоящих блоков, поэтому страница
// не «прыгает» при появлении данных (раньше — одинокий спиннер, потом резкая вставка всего контента).
const pulse = "motion-reduce:animate-none";

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl bg-card border border-border overflow-hidden ${className}`}>{children}</div>;
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Загружаем профиль…</span>

      {/* Шапка: баннер, аватар, имя */}
      <div className="rounded-3xl overflow-hidden border border-border bg-card shadow-sm">
        <Skeleton className={`h-24 sm:h-32 rounded-none ${pulse}`} />
        <div className="px-4 pb-4">
          <div className="flex items-start gap-3">
            <Skeleton className={`-mt-12 size-24 shrink-0 rounded-3xl border-4 border-card ${pulse}`} />
            <div className="flex-1 min-w-0 pt-3 space-y-2">
              <Skeleton className={`h-6 w-2/5 ${pulse}`} />
              <Skeleton className={`h-4 w-3/4 ${pulse}`} />
              <Skeleton className={`h-3 w-1/2 ${pulse}`} />
            </div>
          </div>
          <Skeleton className={`mt-3 h-11 w-full rounded-xl ${pulse}`} />
        </div>
      </div>

      {/* Карточка подписки */}
      <Skeleton className={`h-28 w-full rounded-2xl ${pulse}`} />

      {/* «Личное дело» */}
      <Card>
        <div className="px-4 py-3 border-b border-border">
          <Skeleton className={`h-3 w-24 ${pulse}`} />
        </div>
        <div className="grid grid-cols-2 gap-px bg-border">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-card px-4 py-3.5">
              <Skeleton className={`h-5 w-full ${pulse}`} />
            </div>
          ))}
        </div>
      </Card>

      {/* Достижения */}
      <Card className="p-3">
        <Skeleton className={`mb-3 h-4 w-32 ${pulse}`} />
        <div className="grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-6 gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className={`h-[92px] rounded-xl ${pulse}`} />
          ))}
        </div>
      </Card>

      {/* Поездки */}
      <Card className="p-3">
        <Skeleton className={`mb-3 h-4 w-28 ${pulse}`} />
        <Skeleton className={`h-14 w-full rounded-xl ${pulse}`} />
      </Card>
    </div>
  );
}
