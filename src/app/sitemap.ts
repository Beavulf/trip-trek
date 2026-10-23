import type { MetadataRoute } from "next";

// Приложение за логином: индексируем корень и открытую презентацию /landing.
// NEXTAUTH_URL задаётся в деплое (entrypoint падает без него); фолбэк — текущий прод.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXTAUTH_URL || "https://triptrek.guild-ledger.net.by").replace(/\/$/, "");
  return [
    {
      url: base,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/landing`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
