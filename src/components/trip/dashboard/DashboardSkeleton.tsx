"use client";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero skeleton with shimmer */}
      <div className="rounded-3xl h-40 shimmer" />
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl h-24 shimmer" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      {/* Content skeletons */}
      <div className="rounded-2xl h-32 shimmer" />
      <div className="rounded-2xl h-48 shimmer" />
    </div>
  );
}
