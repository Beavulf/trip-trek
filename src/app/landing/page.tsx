import type { Metadata } from "next";
import { headers } from "next/headers";
import { Onest, Unbounded } from "next/font/google";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { getPublicShowcase } from "@/lib/app-config";
import { LandingView } from "./landing-view";
import { isInAppBrowser, sanitizeInviteParam } from "./showcase";
import "./landing.css";

// Лендинг шрифтами не делится с приложением (там Geist без кириллицы): два семейства
// самохостятся next/font, переменные видны только внутри этой обёртки
const display = Unbounded({ subsets: ["cyrillic", "latin"], variable: "--lp-display", display: "swap" });
const text = Onest({ subsets: ["cyrillic", "latin"], variable: "--lp-text", display: "swap" });

const TITLE = "TripTrek — один маршрут на всех";
const DESCRIPTION =
  "Приложение для поездок с друзьями: маршрут по дням, карта, бюджет с долгами, общий альбом и чат. Открывается в браузере и ставится на экран телефона.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/landing" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/landing",
    siteName: "TripTrek",
    type: "website",
    locale: "ru_RU",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Витрина читает AppSettings: режим регистрации, демо-поездка и контакт меняются из админки
// без пересборки, поэтому страница не кэшируется
export const dynamic = "force-dynamic";

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const [showcase, params, h] = await Promise.all([getPublicShowcase(), searchParams, headers()]);
  return (
    <div className={`${display.variable} ${text.variable}`}>
      <YandexMetrika />
      {/* ?code=… из ссылки в профиле TikTok едет в регистрацию; во встроенном браузере соцсети подсказываем, как открыть нормально */}
      <LandingView
        showcase={showcase}
        inviteCode={sanitizeInviteParam(params.code)}
        inAppBrowser={isInAppBrowser(h.get("user-agent"))}
      />
    </div>
  );
}
