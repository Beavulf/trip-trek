/* eslint-disable @next/next/no-img-element -- картинки лендинга уже сжаты в webp и лежат в public/landing: оптимизатор next/image им не нужен */
import type { ReactNode } from "react";
import { DEFAULT_SHOWCASE, contactLink, demoHref, registerHrefFor, type LandingShowcase } from "./showcase";

// Страница-презентация TripTrek (/landing). Чистая разметка без хуков и next/*:
// рендерится сервером и так же — в статический HTML для предпросмотра.
// Тексты намеренно без привязки к стране; скриншоты — из демо-поездки.
// Витрина (режим регистрации, живой пример, контакт) приходит пропсом из page.tsx.

const LOGIN_HREF = "/login";

type IconProps = { className?: string };

const Svg = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const IconRoute = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="19" r="2.2" />
    <circle cx="18" cy="5" r="2.2" />
    <path d="M8.2 19H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.8" />
  </Svg>
);
const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);
const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <path d="M4 7.5V17a2 2 0 0 0 2 2h12.5a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 8H6.5A2.5 2.5 0 0 1 4 5.5" />
    <circle cx="16.2" cy="13.5" r="1.1" />
  </Svg>
);
const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.4-2h5.2L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.4" />
  </Svg>
);
const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-7l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5z" />
  </Svg>
);
const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Svg>
);
const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14a5.5 5.5 0 0 1 3 5" />
  </Svg>
);
const IconArrow = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

/** Телефонная рамка со скриншотом приложения. */
function Phone({
  src,
  alt,
  className = "",
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <div className={`lp-phone ${className}`}>
      <img
        src={`/landing/${src}.webp`}
        alt={alt}
        width={720}
        height={1558}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </div>
  );
}

/** Рамка телефона вокруг нарисованного экрана (чат, «Сочтёмся», альбом). */
function Screen({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`lp-phone lp-phone--ui ${className}`} role="img" aria-label={label}>
      <div className="lp-ui" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

const photo = (name: string, w: number, h: number, cls = "") => (
  <img className={`lp-ph ${cls}`} src={`/landing/ph-${name}.webp`} alt="" width={w} height={h} loading="lazy" decoding="async" />
);

type StopProps = {
  n: number;
  title: string;
  flip?: boolean;
  art: ReactNode;
  artClass?: string;
  children: ReactNode;
};

function Stop({ n, title, flip, art, artClass = "", children }: StopProps) {
  return (
    <article className={`lp-stop${flip ? " lp-stop--flip" : ""}`}>
      <span className="lp-node" aria-hidden="true">
        {n}
      </span>
      <div className="lp-stop__text">
        <h3 className="lp-h3">{title}</h3>
        {children}
      </div>
      <div className={`lp-stop__art ${artClass}`}>{art}</div>
    </article>
  );
}

function Day({ n, title, sub, tone, children }: { n: number; title: string; sub: string; tone: 1 | 2 | 3; children: ReactNode }) {
  return (
    <section className={`lp-day lp-day--${tone}`} aria-labelledby={`day-${n}`}>
      <div className="lp-wrap lp-spine">
        <header className="lp-day__head">
          <p className="lp-day__n" id={`day-${n}`}>
            День {n}
          </p>
          <p className="lp-day__t">
            <strong>{title}</strong> {sub}
          </p>
        </header>
        {children}
      </div>
    </section>
  );
}

export function LandingView({
  showcase = DEFAULT_SHOWCASE,
  inviteCode = null,
  inAppBrowser = false,
}: {
  showcase?: LandingShowcase;
  /** Код из ссылки `?code=`: подставляется в регистрацию */
  inviteCode?: string | null;
  /** Страница открыта во встроенном браузере соцсети (TikTok и т.п.) */
  inAppBrowser?: boolean;
}) {
  const { registrationEnabled, inviteRequired } = showcase;
  const demo = demoHref(showcase.demoTripToken);
  const contact = contactLink(showcase.contactTelegram);
  // Главная кнопка ведёт туда, где у гостя что-то получится: при закрытой регистрации — на вход
  const entry = registrationEnabled
    ? {
        href: registerHrefFor(inviteCode),
        label: inviteCode ? "Создать аккаунт" : inviteRequired ? "У меня есть код" : "Начать планировать",
      }
    : { href: LOGIN_HREF, label: "Войти" };
  const entryNote = !registrationEnabled
    ? "Регистрация новых аккаунтов сейчас закрыта. "
    : inviteRequired && inviteCode
      ? "Код приглашения уже подставлен в регистрацию. "
      : inviteRequired
        ? "Сейчас вход по приглашениям: код ищите в описании видео или спросите у друга. "
        : "";
  // Во встроенном браузере «поставить на экран» недоступно: честно говорим, как открыть нормально
  const installNote = inAppBrowser
    ? "Чтобы поставить приложение на экран телефона, откройте страницу в Chrome или Safari (меню ⋯ → «Открыть в браузере»)."
    : "Открывается в браузере и ставится на экран телефона как обычное приложение.";

  return (
    <div className="lp">
      {/* ───────── Hero ───────── */}
      <header className="lp-hero">
        <div className="lp-wrap lp-hero__wrap">
          <svg className="lp-thread lp-thread--d" viewBox="0 0 1120 420" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="lp-g-d" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff8a3d" />
                <stop offset="0.5" stopColor="#ff3d7f" />
                <stop offset="1" stopColor="#ff6b2c" />
              </linearGradient>
              <mask id="lp-m-d" maskUnits="userSpaceOnUse" x="0" y="0" width="1120" height="420">
                <path
                  className="lp-thread__reveal"
                  pathLength="1"
                  d="M1010 0 C1010 120 940 210 800 250 S560 334 420 346 S90 372 32 420"
                  stroke="#fff"
                  strokeWidth="14"
                  fill="none"
                />
              </mask>
            </defs>
            <path
              className="lp-thread__dots"
              mask="url(#lp-m-d)"
              d="M1010 0 C1010 120 940 210 800 250 S560 334 420 346 S90 372 32 420"
              stroke="url(#lp-g-d)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="0.1 12"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
            <circle className="lp-thread__pin lp-thread__pin--b" cx="800" cy="250" r="6" />
          </svg>

          <nav className="lp-top" aria-label="Основная навигация">
            <a className="lp-brand" href="#top">
              <img src="/icon-192.png" alt="" width={36} height={36} />
              <span className="lp-disp">TripTrek</span>
            </a>
            <a className="lp-top__login" href={LOGIN_HREF}>
              Войти
            </a>
          </nav>

          <div className="lp-hero__grid" id="top">
            <div className="lp-hero__copy">
              <p className="lp-beta">
                <span className="lp-beta__dot" aria-hidden="true" />
                {registrationEnabled && !inviteRequired ? "Открытая бета" : "Закрытая бета"}
              </p>
              <h1 className="lp-h1 lp-disp">
                Один
                <br />
                маршрут
                <br />
                на всех
              </h1>
              <p className="lp-lead">
                Приложение для поездок с друзьями: маршрут по дням, карта, бюджет с долгами, общий альбом и чат. У всей компании сразу и всегда под рукой.
              </p>
              <div className="lp-cta">
                <a className="lp-btn lp-btn--main" href={entry.href}>
                  {entry.label}
                  <IconArrow className="lp-btn__ico" />
                </a>
                <a className="lp-btn lp-btn--ghost" href="#inside">
                  Что внутри
                </a>
              </div>
              <p className="lp-note">
                {entryNote}{installNote}
              </p>
            </div>

            <div className="lp-hero__art">
              <svg className="lp-thread lp-thread--m" viewBox="0 0 350 500" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="lp-g-m" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ff8a3d" />
                    <stop offset="0.55" stopColor="#ff3d7f" />
                    <stop offset="1" stopColor="#ff6b2c" />
                  </linearGradient>
                  <mask id="lp-m-m" maskUnits="userSpaceOnUse" x="0" y="0" width="350" height="500">
                    <path
                      className="lp-thread__reveal"
                      pathLength="1"
                      d="M336 64 C344 150 332 232 230 300 S40 360 24 430 S14 480 14 500"
                      stroke="#fff"
                      strokeWidth="14"
                      fill="none"
                    />
                  </mask>
                </defs>
                <path
                  className="lp-thread__dots"
                  mask="url(#lp-m-m)"
                  d="M336 64 C344 150 332 232 230 300 S40 360 24 430 S14 480 14 500"
                  stroke="url(#lp-g-m)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="0.1 11"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
                <circle className="lp-thread__pin" cx="336" cy="64" r="6" />
                <circle className="lp-thread__pin lp-thread__pin--b" cx="230" cy="300" r="5" />
              </svg>
              <Phone src="shot-overview" alt="Главный экран поездки: прогресс, бюджет и ближайшие места" className="lp-phone--hero" eager />
              <ul className="lp-chips" aria-label="Что внутри">
                <li className="lp-chip lp-chip--a">
                  <IconRoute /> Маршрут
                </li>
                <li className="lp-chip lp-chip--b">
                  <IconWallet /> Бюджет
                </li>
                <li className="lp-chip lp-chip--c">
                  <IconCamera /> Альбом
                </li>
                <li className="lp-chip lp-chip--d">
                  <IconChat /> Чат
                </li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      <main id="inside">
        {/* ───────── День 1 ───────── */}
        <Day n={1} title="Планируем." sub="Всё, что нужно до выезда." tone={1}>
          <Stop
            n={1}
            title="Маршрут по дням"
            art={<Phone src="shot-itinerary" alt="Маршрут по дням: города, места, прогресс и подбор мест с ИИ" className="lp-tilt-l" />}
          >
            <p className="lp-p">
              Города, места и время в одном списке на всю компанию. Отмечайте посещённое, добавляйте дни, когда планы меняются, и скачивайте маршрут в PDF.
            </p>
            <p className="lp-aside">
              <IconSpark />
              <span>
                <strong>Помощник на ИИ.</strong> Предлагает места из реальных карт, а в план попадёт только то, что выберете вы.
              </span>
            </p>
          </Stop>

          <Stop
            n={2}
            flip
            title="Карта с нитями маршрута"
            art={<Phone src="shot-map" alt="Карта: места дня, нити маршрута и фото с геометками" className="lp-tilt-r" />}
          >
            <p className="lp-p">
              Все места и путь между ними на одной карте. Можно смотреть сразу весь маршрут или один город. Фото с геометками встают туда, где вы их сняли.
            </p>
          </Stop>

          <Stop
            n={3}
            title="Деньги без споров"
            art={<Phone src="shot-budget" alt="Бюджет поездки: план против факта по категориям" className="lp-tilt-l" />}
          >
            <p className="lp-p">
              План против факта по каждой категории. Записали, кто за кого платил, и приложение само посчитает, кто кому должен и сколько перевести, чтобы закрыть долги.
            </p>
            <ul className="lp-tags">
              <li>Любые валюты</li>
              <li>Делёж между выбранными</li>
              <li>Бюджет на каждого</li>
            </ul>
          </Stop>
        </Day>

        {/* ───────── День 2 ───────── */}
        <Day n={2} title="В дороге." sub="Все видят одно и то же." tone={2}>
          <Stop
            n={4}
            title="Общий альбом"
            art={
              <Screen label="Общий фотоальбом поездки: кадры по дням" className="lp-tilt-r">
                <div className="ui-album">
                  <div className="ui-album__hero">
                    <p className="ui-kicker">
                      <IconCamera /> Фотоальбом поездки
                    </p>
                    <p className="ui-album__big">882 кадра</p>
                    <p className="ui-dim">6 городов · 13 дней с фото · 3 автора</p>
                  </div>
                  <div className="ui-tabs">
                    <span className="ui-tab ui-tab--on">Все</span>
                    <span className="ui-tab">День 1</span>
                    <span className="ui-tab">День 2</span>
                    <span className="ui-tab">День 3</span>
                  </div>
                  <div className="ui-masonry">
                    <div className="ui-col">
                      {photo("d2-48", 360, 480, "ui-tile")}
                      {photo("d3-06", 480, 360, "ui-tile")}
                      {photo("d1-35", 360, 480, "ui-tile")}
                    </div>
                    <div className="ui-col">
                      {photo("d3-28", 360, 480, "ui-tile")}
                      {photo("d1-12", 480, 360, "ui-tile")}
                      {photo("d2-43", 360, 480, "ui-tile")}
                    </div>
                  </div>
                </div>
              </Screen>
            }
          >
            <p className="lp-p">
              Фото уходят в общий альбом в фоне: связь пропала или вы закрыли приложение, а загрузка продолжится. Смотрите по дням, городам и авторам, сохраняйте лучшие кадры в избранное.
            </p>
            <p className="lp-aside">
              <IconCheck />
              <span>Геометки из файлов убираются, а на карте кадр всё равно оказывается на своём месте.</span>
            </p>
          </Stop>

          <Stop
            n={5}
            flip
            title="Все на связи"
            art={
              <Screen label="Чат поездки: сообщения друзей и новое место в маршруте" className="lp-tilt-l">
                <div className="ui-chat">
                  <div className="ui-chat__bar">
                    <IconChat />
                    <strong>Чат</strong>
                    <span className="ui-dim">4 участника</span>
                  </div>
                  <p className="ui-pin">
                    <IconPin />
                    <span>Сбор в 9:00 у входа</span>
                  </p>
                  <p className="ui-sys">Макс присоединился по коду</p>
                  <p className="ui-msg ui-msg--in">
                    <b>Аня</b>
                    Кто берёт билеты на утро?
                  </p>
                  <p className="ui-msg ui-msg--out">Я, вышлю в 8:00 👍</p>
                  <p className="ui-msg ui-msg--in">
                    <b>Макс</b>
                    Тогда я бронирую обед
                    <em className="ui-react">🔥 2</em>
                  </p>
                  <p className="ui-msg ui-msg--in">
                    <b>Лея</b>
                    Нашла кафе у реки, добавила в маршрут
                  </p>
                  <div className="ui-added">
                    <IconPin />
                    <span>
                      <b>Кафе у реки</b>
                      <i>добавлено в День 2</i>
                    </span>
                  </div>
                  <div className="ui-chat__input">Сообщение…</div>
                </div>
              </Screen>
            }
          >
            <p className="lp-p">
              Правки друзей появляются сразу, без обновления страницы. В чате можно отвечать на сообщения и ставить реакции, а пуши напомнят о важном.
            </p>
            <p className="lp-aside">
              <IconUsers />
              <span>
                Зовите друзей по коду, ссылке или QR. Тех, кто просто следит за поездкой, можно позвать как зрителей: они смотрят, но ничего не меняют.
              </span>
            </p>
          </Stop>

          <Stop
            n={6}
            title="Всё под рукой"
            artClass="lp-trio"
            art={
              <>
                <Phone src="shot-weather" alt="Погода по городам маршрута и прогноз на неделю" className="lp-trio__a" />
                <Phone src="shot-phrases" alt="Разговорник с озвучкой фраз" className="lp-trio__b" />
                <Phone src="shot-awards" alt="Награды поездки" className="lp-trio__c" />
              </>
            }
          >
            <p className="lp-p">
              Погода по городам маршрута. Разговорник, который озвучивает фразы и после первой загрузки работает без сети. Гастрогид, где вся компания голосует, что попробовать. И награды за общий прогресс.
            </p>
          </Stop>
        </Day>

        {/* ───────── День 3 ───────── */}
        <Day n={3} title="Вспоминаем." sub="Поездка не заканчивается на возвращении." tone={3}>
          <Stop
            n={7}
            title="История поездки"
            art={<Phone src="shot-ai" alt="ИИ-итоги: готовый рассказ из мест, дневника и трат" className="lp-tilt-l" />}
          >
            <p className="lp-p">
              Дневник с настроением по дням. А из мест, записей и трат ИИ соберёт готовую историю: тёплым рассказом или письмом другу. Такую не стыдно переслать.
            </p>
          </Stop>

          <Stop
            n={8}
            flip
            title="Поделиться красиво"
            artClass="lp-cards"
            art={
              <>
                <figure className="lp-polaroid" aria-label="Карточка поездки «Поляроид»">
                  {photo("d2-00", 480, 360)}
                  <figcaption>День 2 · у воды</figcaption>
                </figure>
                <figure className="lp-ticket" aria-label="Карточка поездки «Билет»">
                  <p className="lp-ticket__route">
                    <span>Старт</span>
                    <i aria-hidden="true" />
                    <span>Финиш</span>
                  </p>
                  <p className="lp-ticket__big lp-disp">13 дней</p>
                  <p className="lp-ticket__row">
                    <span>54 места</span>
                    <span>882 фото</span>
                  </p>
                  <p className="lp-ticket__foot">TripTrek</p>
                </figure>
              </>
            }
          >
            <p className="lp-p">
              Публичная страница поездки открывается по ссылке без регистрации: друзья листают фото и маршрут, а альбом можно скачать одним архивом. Для сторис есть карточки: билет, поляроид, итоги.
            </p>
          </Stop>
        </Day>

        {/* ───────── Сочтёмся ───────── */}
        <section className="lp-split" aria-labelledby="split-title">
          <div className="lp-wrap lp-split__grid">
            <div className="lp-split__text">
              <p className="lp-split__kicker">Не только для поездок</p>
              <h2 className="lp-h2 lp-disp" id="split-title">
                Сочтёмся
              </h2>
              <p className="lp-lead lp-lead--split">
                Обычная жизнь тоже складывается из общих трат: аренда, продукты, интернет, такси. Отдельный раздел, где друзья и соседи ведут их вместе.
              </p>
              <ul className="lp-checks">
                <li>
                  <IconCheck /> Поровну, долями, по процентам или точными суммами
                </li>
                <li>
                  <IconCheck /> Повторяющиеся платежи, например аренда первого числа
                </li>
                <li>
                  <IconCheck /> Итоги месяца и журнал: видно, кто что менял
                </li>
                <li>
                  <IconCheck /> Участника можно добавить, даже если у него ещё нет аккаунта
                </li>
              </ul>
            </div>
            <Screen label="Раздел «Сочтёмся»: баланс группы и последние траты" className="lp-split__phone">
              <div className="ui-split">
                <div className="ui-split__bar">
                  <span className="ui-split__logo">$</span>
                  <span>
                    <strong>Сочтёмся</strong>
                    <i>общие траты с друзьями</i>
                  </span>
                </div>
                <div className="ui-split__card">
                  <p className="ui-kicker">Мои расчёты</p>
                  <p className="ui-dim">Тебе должны</p>
                  <p className="ui-split__sum">$ 42,50</p>
                </div>
                <p className="ui-split__group">
                  <span className="ui-split__ava">🏠</span>
                  <span>
                    <b>Квартира</b>
                    <i>3 участника</i>
                  </span>
                  <em>+ $ 42,50</em>
                </p>
                <div className="ui-split__tabs">
                  <span className="ui-split__tab ui-split__tab--on">Траты</span>
                  <span className="ui-split__tab">Баланс</span>
                  <span className="ui-split__tab">Итоги</span>
                  <span className="ui-split__tab">Ещё</span>
                </div>
                <ul className="ui-split__list">
                  <li>
                    <span>
                      <b>Продукты</b>
                      <i>Аня заплатила · поровну</i>
                    </span>
                    <em>$ 64,00</em>
                  </li>
                  <li>
                    <span>
                      <b>Интернет</b>
                      <i>Макс · каждое 1-е число</i>
                    </span>
                    <em>$ 18,00</em>
                  </li>
                  <li>
                    <span>
                      <b>Такси</b>
                      <i>Лея · доли 2 : 1 : 1</i>
                    </span>
                    <em>$ 12,00</em>
                  </li>
                </ul>
                <div className="ui-split__chart">
                  <p className="ui-kicker">Итоги месяца</p>
                  <div className="ui-split__bars" aria-hidden="true">
                    <i style={{ height: "38%" }} />
                    <i style={{ height: "64%" }} />
                    <i style={{ height: "46%" }} />
                    <i style={{ height: "88%" }} />
                    <i style={{ height: "58%" }} />
                    <i style={{ height: "72%" }} />
                  </div>
                </div>
                <p className="ui-split__btn">Рассчитаться</p>
              </div>
            </Screen>
          </div>
        </section>

        {/* ───────── Финал ───────── */}
        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-wrap">
            {demo && (
              <div className="lp-demo">
                <div>
                  <p className="lp-demo__title lp-disp">Посмотрите, как выглядит готовая поездка</p>
                  <p className="lp-p lp-demo__p">
                    Публичная страница настоящей поездки: маршрут, карта и фото. Входить для этого не нужно.
                  </p>
                </div>
                <a className="lp-btn lp-btn--ghost" href={demo}>
                  Открыть пример
                  <IconArrow className="lp-btn__ico" />
                </a>
              </div>
            )}
            <div className="lp-pass">
              <div className="lp-pass__main">
                <h2 className="lp-h2 lp-disp" id="final-title">
                  Соберите первую поездку
                </h2>
                <p className="lp-p lp-pass__p">
                  Создайте аккаунт, позовите друзей по ссылке и разложите маршрут по дням. Ничего устанавливать не нужно.
                </p>
                <div className="lp-cta">
                  <a className="lp-btn lp-btn--main" href={entry.href}>
                    {entry.label}
                    <IconArrow className="lp-btn__ico" />
                  </a>
                  {registrationEnabled && (
                    <a className="lp-btn lp-btn--ghost" href={LOGIN_HREF}>
                      У меня уже есть аккаунт
                    </a>
                  )}
                </div>
              </div>
              <dl className="lp-pass__stub">
                <div>
                  <dt>Рейс</dt>
                  <dd>Бета</dd>
                </div>
                <div>
                  <dt>Пассажиры</dt>
                  <dd>Вы и ваша компания</dd>
                </div>
                <div>
                  <dt>Место</dt>
                  <dd>Любое</dd>
                </div>
              </dl>
            </div>
            <p className="lp-beta-note">
              Приложение в бете, поэтому возможны шероховатости. Внутри есть раздел «Обратная связь»: баг, идея, вопрос, жалоба или отзыв. Мы читаем всё и отвечаем.
              {contact && (
                <>
                  {" "}
                  Не получается войти? Напишите в Telegram:{" "}
                  <a href={contact.href} target="_blank" rel="noreferrer">
                    {contact.label}
                  </a>
                  .
                </>
              )}
            </p>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__row">
          <a className="lp-brand lp-brand--sm" href="#top">
            <img src="/icon-192.png" alt="" width={28} height={28} />
            <span className="lp-disp">TripTrek</span>
          </a>
          <p>
            Фото очищаются от геометок на сервере, а пароли хранятся только в виде хешей.{" "}
            <a href="/privacy">Политика конфиденциальности</a>
          </p>
          <a href={LOGIN_HREF}>Войти</a>
        </div>
      </footer>
    </div>
  );
}
