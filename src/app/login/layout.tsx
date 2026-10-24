import type { ReactNode } from "react";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";

// Сама страница входа — клиентская, а счётчику Метрики нужно читать env в рантайме
// (иначе номер счётчика пришлось бы закладывать при сборке образа). Поэтому счётчик
// монтируется здесь, в серверном layout, а сегмент помечен динамическим: без этого
// layout отрисовался бы один раз при сборке и «запомнил» отсутствие переменной
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <YandexMetrika />
      {children}
    </>
  );
}
