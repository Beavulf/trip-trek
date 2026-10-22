"use client";

// Скелетон вкладки «Бюджет»: повторяет раскладку (шапка → план → аналитика → расчёт → история),
// поэтому после загрузки контент встаёт на место без прыжка. Вместо одинокого «Загрузка бюджета…».
export function BudgetSkeleton() {
  const blocks = ["h-48 rounded-3xl", "h-40", "h-56", "h-64", "h-48"];
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загрузка бюджета">
      {blocks.map((cls, i) => (
        <div key={i} className={`${cls} ${i === 0 ? "" : "rounded-2xl"} shimmer`} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}
