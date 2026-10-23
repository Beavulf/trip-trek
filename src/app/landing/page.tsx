import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Camera,
  Map as MapIcon,
  MessageCircle,
  Sparkles,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { getPublicShowcase } from "@/lib/app-config";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";

export const dynamic = "force-dynamic"; // витрина читает AppSettings: демо-токен и контакт меняются из админки

export const metadata: Metadata = {
  title: "TripTrek — планирование путешествий вместе",
  description:
    "Маршрут по дням, общий бюджет с расчётом долгов, галерея и дневник — одно приложение для всей компании.",
  openGraph: {
    title: "TripTrek — планирование путешествий вместе",
    description: "Маршрут, бюджет, галерея и дневник поездки — в одном приложении.",
    images: ["/og-image.jpg"],
  },
};

// Блоки «Возможностей»: картинка + одна мысль. Картинки в public/landing/ —
// плейсхолдеры, владелец заменит скриншотами (пути тогда меняются на .png)
const FEATURES = [
  {
    icon: MapIcon,
    img: "/landing/route.svg",
    title: "Маршрут по дням",
    text: "Места, время, жильё и нити маршрута на карте — план виден целиком.",
  },
  {
    icon: Bot,
    img: "/landing/planner.svg",
    title: "ИИ-планер",
    text: "Черновик маршрута из реальных мест — вы подтверждаете каждый пункт.",
  },
  {
    icon: Wallet,
    img: "/landing/budget.svg",
    title: "Общий бюджет",
    text: "Траты в любых валютах и честное «кто кому сколько должен».",
  },
  {
    icon: Camera,
    img: "/landing/gallery.svg",
    title: "Галерея и дневник",
    text: "Фото грузятся в фоне и переживают закрытие приложения, дневник остаётся.",
  },
  {
    icon: MessageCircle,
    img: "/landing/together.svg",
    title: "Вместе в реальном времени",
    text: "Чат, пуши и приглашение в поездку кодом — все видят изменения сразу.",
  },
  {
    icon: UtensilsCrossed,
    img: "/landing/trip.svg",
    title: "Помощники в поездке",
    text: "Гастрогид, разговорник с ИИ, погода и достижения за посещённые места.",
  },
];

export default async function LandingPage() {
  const showcase = await getPublicShowcase();
  const registerHref = "/login?mode=register";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <YandexMetrika />

      {/* === Hero === */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600 text-white">
        <div className="absolute top-10 left-10 size-40 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute bottom-10 right-10 size-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center space-y-6">
          <img src="/icon-192.png" alt="Логотип TripTrek" className="mx-auto size-20 rounded-3xl shadow-xl" />
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Путешествие планируем вместе
          </h1>
          <p className="text-lg text-white/85 max-w-xl mx-auto">
            Маршрут по дням, общий бюджет, галерея и дневник — всё в одном месте,
            на телефоне у каждого участника поездки.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={registerHref}
              className="min-h-12 inline-flex items-center rounded-2xl bg-white px-7 font-semibold text-foreground shadow-lg transition-transform active:scale-95"
            >
              Начать планирование
            </Link>
            {showcase.inviteRequired && (
              <Link
                href={registerHref}
                className="min-h-12 inline-flex items-center rounded-2xl border border-white/40 px-7 font-semibold transition-transform active:scale-95"
              >
                У меня есть код
              </Link>
            )}
          </div>
          <p className="inline-block rounded-full bg-black/20 px-3 py-1 text-xs">
            Бета: могут быть шероховатости — внутри есть кнопка «Сообщить о баге», мы читаем всё
          </p>
        </div>
      </section>

      {/* === Возможности === */}
      <section className="mx-auto max-w-4xl px-4 py-16 space-y-8">
        <h2 className="text-center text-2xl font-bold">На что способно приложение</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article key={f.title} className="rounded-3xl border border-border bg-card overflow-hidden">
                <img src={f.img} alt={f.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <div className="p-4 space-y-1.5">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    {f.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* === Живой пример === */}
      {showcase.demoTripToken && (
        <section className="mx-auto max-w-4xl px-4 pb-16">
          <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-4">
            <Sparkles className="mx-auto size-6 text-primary" />
            <h2 className="text-2xl font-bold">Вот так выглядит настоящая поездка</h2>
            <p className="text-sm text-muted-foreground">
              Публичная страница реального путешествия: маршрут, карта и галерея.
            </p>
            <Link
              href={`/p/${showcase.demoTripToken}`}
              className="inline-flex min-h-12 items-center rounded-2xl bg-primary px-7 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
            >
              Открыть живой пример
            </Link>
          </div>
        </section>
      )}

      {/* === CTA + футер === */}
      <section className="mx-auto max-w-4xl px-4 pb-16 text-center space-y-4">
        <Link
          href={registerHref}
          className="inline-flex min-h-12 items-center rounded-2xl bg-primary px-8 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          Планировать свою поездку
        </Link>
        <footer className="pt-6 text-xs text-muted-foreground space-y-1">
          <p>
            Фото чистятся от геометок, пароли хранятся только в виде хешей.
          </p>
          {showcase.contactTelegram && (
            <p>
              Вопросы —{" "}
              <a
                href={showcase.contactTelegram.startsWith("@")
                  ? `https://t.me/${showcase.contactTelegram.slice(1)}`
                  : showcase.contactTelegram}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {showcase.contactTelegram}
              </a>
            </p>
          )}
        </footer>
      </section>
    </main>
  );
}
