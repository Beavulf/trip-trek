import type { Metadata, Viewport } from "next";

// «Сочтёмся» — отдельный раздел со своим акцентом (изумрудный вместо оранжевого поездок). Переопределение токенов
// темы лежит в <style> этого layout: оно действует, пока раздел смонтирован, уходит вместе с ним и без вспышки
// оранжевого на первом кадре. Порталы (шиты, диалоги) рендерятся в body, поэтому токены заданы на :root/.dark,
// а не на обёртке.
export const metadata: Metadata = {
  title: "Сочтёмся — общие траты с друзьями",
  description: "Делите повседневные траты с друзьями: кто за что заплатил, кто кому должен, итоги месяца.",
  manifest: "/split.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Сочтёмся" },
  openGraph: { title: "Сочтёмся — общие траты с друзьями", siteName: "TripTrek", type: "website", locale: "ru_RU" },
};

export const viewport: Viewport = { themeColor: "#10b981" };

const THEME_CSS = `
:root {
  --primary: oklch(0.58 0.14 163);
  --primary-foreground: oklch(0.99 0.01 163);
  --ring: oklch(0.58 0.14 163);
  --accent: oklch(0.94 0.035 163);
}
.dark {
  --primary: oklch(0.74 0.15 163);
  --primary-foreground: oklch(0.15 0.03 163);
  --ring: oklch(0.74 0.15 163);
  --accent: oklch(0.3 0.045 163);
}
`;

export default function SplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{THEME_CSS}</style>
      {children}
    </>
  );
}
