// Данные мини-макетов обучения. Макет — это не картинка, а описание упрощённого экрана:
// из него компонент рисует блоки в токенах темы и сам «водит пальцем» — курсор доезжает
// до цели (tap), нажимает, и появляются блоки then. Данные без React, чтобы шаги обучения
// проверялись юнит-тестами (ссылки tap на существующие id, число блоков, влезание в рамку).

export type MockTone = "primary" | "green" | "amber" | "red" | "violet" | "sky" | "muted";

export type MockBlock =
  /** Шапка экрана: заголовок слева, пометка/кнопка справа */
  | { k: "title"; text: string; right?: string; id?: string }
  /** Строка списка: значок-эмодзи, текст, подпись, бейдж справа */
  | { k: "row"; text: string; sub?: string; icon?: string; badge?: string; tone?: MockTone; done?: boolean; id?: string }
  /** Кнопка (ghost — контурная) */
  | { k: "btn"; text: string; tone?: MockTone; ghost?: boolean; id?: string }
  /** Ряд пилюль-фильтров */
  | { k: "chips"; items: { text: string; on?: boolean }[]; id?: string }
  /** Полоса прогресса с подписью */
  | { k: "meter"; text: string; value: number; right?: string; tone?: MockTone; id?: string }
  /** Мини-карта: метки в долях рамки, опционально линия маршрута между ними */
  | { k: "map"; pins: { x: number; y: number; tone?: MockTone; done?: boolean }[]; route?: boolean; id?: string }
  /** Сообщение чата */
  | { k: "msg"; text: string; me?: boolean; id?: string }
  /** Сетка фото-плиток */
  | { k: "photos"; count: number; id?: string }
  /** Плитки-цифры */
  | { k: "stats"; items: { label: string; value: string; tone?: MockTone }[]; id?: string }
  /** Поле ввода с текстом/подсказкой */
  | { k: "field"; text: string; id?: string }
  /** Полоса вкладок; groups — индексы, перед которыми стоит разделитель. Вкладка i имеет id `${id}${i}` */
  | { k: "tabs"; items: string[]; on: number; groups?: number[]; id: string }
  /** Круглая кнопка «+» в углу рамки */
  | { k: "fab"; id?: string }
  /** Пилюля с кодом/ссылкой */
  | { k: "code"; text: string; id?: string }
  /** Аватарки участников */
  | { k: "people"; items: string[]; id?: string }
  /** Врезка-пояснение */
  | { k: "note"; text: string; tone?: MockTone; id?: string };

export interface MockScene {
  /** Начальное состояние экрана */
  blocks: MockBlock[];
  /** id блока, на который «нажимает» курсор (у `tabs` — id вкладки: `${id}${i}`) */
  tap?: string;
  /** Что происходит после нажатия: добавить блоки в конец или заменить экран целиком */
  then?: MockBlock[];
  thenMode?: "append" | "replace";
}

/** Размер рамки: больше блоков — не влезет в иллюстрацию (проверяется тестом) */
export const MOCK_MAX_BLOCKS = 5;

function blockIds(blocks: MockBlock[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.k === "tabs") b.items.forEach((_, i) => ids.push(`${b.id}${i}`));
    else if (b.id) ids.push(b.id);
  }
  return ids;
}

/** Ошибки макета (пустой список = всё хорошо): висячий tap, дубли id, перегруз рамки */
export function validateScene(scene: MockScene): string[] {
  const errors: string[] = [];
  const all = [...scene.blocks, ...(scene.then ?? [])];
  const ids = blockIds(all);
  if (new Set(ids).size !== ids.length) errors.push("повторяющиеся id блоков");
  if (scene.tap && !blockIds(scene.blocks).includes(scene.tap)) errors.push(`tap «${scene.tap}» не найден среди начальных блоков`);
  if (scene.then && !scene.tap) errors.push("then без tap: нечему запускать смену экрана");
  if (scene.then && scene.then.length === 0) errors.push("then пуст");
  const worst =
    scene.thenMode === "replace" ? Math.max(scene.blocks.length, scene.then?.length ?? 0) : all.length;
  if (worst > MOCK_MAX_BLOCKS) errors.push(`блоков ${worst} > ${MOCK_MAX_BLOCKS}: не влезет в рамку`);
  if (scene.blocks.length === 0) errors.push("пустой макет");
  return errors;
}
