import { db } from "../src/lib/db";

const CHECKLIST: Array<{ text: string; category: string; order: number }> = [
  // Документы
  { text: "Проверить срок действия паспорта (минимум 6 месяцев)", category: "documents", order: 0 },
  { text: "Оформить медстраховку с покрытием в Китае", category: "documents", order: 1 },
  { text: "Сделать копии документов (паспорт, страховка)", category: "documents", order: 2 },
  { text: "Сохранить адрес и телефон отеля на китайском", category: "documents", order: 3 },
  // Здоровье
  { text: "Проверить вакцинации (гепатит А, Б, тиф)", category: "health", order: 0 },
  { text: "Собрать аптечку (обезболивающие, от расстройства желудка)", category: "health", order: 1 },
  { text: "Купить солнцезащитный крем и очки", category: "health", order: 2 },
  { text: "Купить удобную обувь для долгих прогулок", category: "health", order: 3 },
  { text: "Купить многоразовую бутылку для воды", category: "health", order: 4 },
  // Подготовка
  { text: "Скачать приложения: Maps.me, Dianping, Google Translate (офлайн-пакеты)", category: "preparation", order: 0 },
  { text: "Купить eSIM (Airalo) или местную SIM-карту", category: "preparation", order: 1 },
  { text: "Подготовить наличные (доллары) для обмена", category: "preparation", order: 2 },
  { text: "Уведомить банк о поездке за границу", category: "preparation", order: 3 },
  { text: "Привязать иностранную карту к Alipay и WeChat Pay", category: "preparation", order: 4 },
  { text: "Сохранить контакты посольства/консульства", category: "preparation", order: 5 },
];

const INFO_ITEMS: Array<{ type: string; title: string; content: string; icon: string | null; order: number }> = [
  // Контакты
  { type: "contact", title: "Единый номер экстренных служб", content: "110 — полиция, 120 — скорая, 119 — пожарная", icon: "🚨", order: 0 },
  { type: "contact", title: "Медстраховка", content: "Сохраните номер полиса и телефон ассистанс", icon: "🏥", order: 1 },
  { type: "contact", title: "Отель", content: "Сохраните адрес и телефон на китайском", icon: "🏨", order: 2 },
  // Транспорт
  { type: "transport", title: "Гуанчжоу и Шэньчжэнь", content: "Метро — основной транспорт, $0.5-1 за поездку. Приложения: Metro Man, Citymapper. Оплата через Alipay.", icon: "🚇", order: 0 },
  { type: "transport", title: "Гонконг", content: "Octopus Card — для транспорта и покупок. MTR (метро) — быстрый и удобный. Звёздный паром между островом и Коулуном.", icon: "🚆", order: 1 },
  { type: "transport", title: "Макао", content: "Автобусы — дешёвый транспорт. Многие достопримечательности в пешей доступности. Бесплатные шаттлы от казино до паромных терминалов.", icon: "🚌", order: 2 },
  { type: "transport", title: "Между городами", content: "Гуанчжоу→Шэньчжэнь: скоростной поезд 30-40 мин, $5-10. Шэньчжэнь→Гонконг: паром 1 час, $15-20. Гонконг→Макао: паром 1 час, $15-20.", icon: "🚄", order: 3 },
  // Питание
  { type: "food", title: "Поиск кафе", content: "Используйте приложение Dianping (китайский Yelp) для поиска кафе рядом", icon: "📲", order: 0 },
  { type: "food", title: "Уличная еда", content: "Начинайте с небольших порций, чтобы проверить реакцию организма", icon: "🍜", order: 1 },
  { type: "food", title: "Вода", content: "Всегда носите с собой бутылку воды. Пейте только бутилированную.", icon: "💧", order: 2 },
  // Советы
  { type: "tip", title: "Платежи", content: "Alipay и WeChat Pay принимаются везде — привяжите иностранную карту заранее", icon: "💳", order: 0 },
  { type: "tip", title: "Язык", content: "В Гуанчжоу и Шэньчжэне — путунхуа, в Гонконге и Макао — кантонский, но английский распространён", icon: "🗣️", order: 1 },
  { type: "tip", title: "Отдых", content: "Планируйте 1-2 часа отдыха днем, особенно в жару. Каждые 2-3 часа — остановки в кафе.", icon: "😴", order: 2 },
  { type: "tip", title: "Казино Макао", content: "Казино открыты 24/7, вход свободный, дресс-код casual. Можно просто гулять и смотреть — бесплатно.", icon: "🎰", order: 3 },
  { type: "tip", title: "Связь", content: "Купите eSIM (Airalo) или местную SIM-карту при прилете", icon: "📱", order: 4 },
];

async function main() {
  console.log("🌱 Seeding checklist and info items...");
  await db.checklistItem.deleteMany();
  await db.infoItem.deleteMany();

  for (const item of CHECKLIST) {
    await db.checklistItem.create({ data: item });
  }
  console.log(`✓ Created ${CHECKLIST.length} checklist items`);

  for (const item of INFO_ITEMS) {
    await db.infoItem.create({ data: item });
  }
  console.log(`✓ Created ${INFO_ITEMS.length} info items`);
  console.log("🌱 Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
