import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { MainApp } from "./app-client";

// Сам SPA — клиентский, а счётчику Метрики нужно читать env в рантайме (как на
// /login): без force-dynamic страница отрисовалась бы при сборке и «запомнила»
// отсутствие переменной. Счётчик монтируем ради целей онбординга — tour_start и
// шаги тура (tour-host) срабатывают уже внутри приложения, после входа.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <YandexMetrika />
      <MainApp />
    </>
  );
}
