import Script from "next/script";

// Яндекс.Метрика для воронки беты (видео → визит → регистрация). Идентификатор
// приходит через env: без NEXT_PUBLIC_YANDEX_METRIKA_ID скрипт не подключается
// вовсе — dev и приватные инстансы остаются без внешних запросов.
const ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;

export function YandexMetrika() {
  if (!ID) return null;
  return (
    <Script
      id="yandex-metrika"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html:
          `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};` +
          `m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,` +
          `k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");` +
          `ym(${ID}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false });`,
      }}
    />
  );
}
