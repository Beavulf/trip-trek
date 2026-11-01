"use client";

// Скелетон вкладки «Бюджет»: повторяет раскладку «Сводки» (разделы → шапка → расчёт → бюджеты),
// поэтому после загрузки контент встаёт на место без прыжка. Вместо одинокого «Загрузка бюджета…».
export function BudgetSkeleton() {
  const blocks = ["h-[3.25rem]", "h-64 rounded-3xl", "h-36", "h-44"];
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загрузка бюджета">
      {blocks.map((cls, i) => (
        <div key={i} className={`${cls} ${i === 1 ? "" : "rounded-2xl"} shimmer`} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}
