"use client";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загрузка обзора">
      {/* Hero */}
      <div className="rounded-3xl h-56 shimmer" />
      {/* Бюджет + три счётчика */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="col-span-3 lg:col-span-2 rounded-2xl h-32 shimmer" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl h-32 shimmer" style={{ animationDelay: `${(i + 1) * 0.15}s` }} />
        ))}
      </div>
      {/* Следующее место + план на день */}
      <div className="rounded-2xl h-20 shimmer" />
      <div className="rounded-2xl h-44 shimmer" />
      {/* Линия маршрута */}
      <div className="rounded-2xl h-36 shimmer" />
    </div>
  );
}
