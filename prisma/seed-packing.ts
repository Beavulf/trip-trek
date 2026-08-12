import { db } from "../src/lib/db";

const PACKING_ITEMS: Array<{ text: string; category: string; order: number }> = [
  // Сборы туда
  { text: "Паспорт (+ копия)", category: "packing_there", order: 0 },
  { text: "Билеты на самолёт", category: "packing_there", order: 1 },
  { text: "Медстраховка", category: "packing_there", order: 2 },
  { text: "Бронь отелей (распечатка)", category: "packing_there", order: 3 },
  { text: "Наличные доллары", category: "packing_there", order: 4 },
  { text: "Банковские карты (2+)", category: "packing_there", order: 5 },
  { text: "eSIM или SIM-карта", category: "packing_there", order: 6 },
  { text: "Одежда на 12 дней", category: "packing_there", order: 7 },
  { text: "Удобная обувь", category: "packing_there", order: 8 },
  { text: "Кроссовки для прогулок", category: "packing_there", order: 9 },
  { text: "Лёгкая куртка/ветровка", category: "packing_there", order: 10 },
  { text: "Купальник/плавки", category: "packing_there", order: 11 },
  { text: "Солнцезащитный крем", category: "packing_there", order: 12 },
  { text: "Солнечные очки", category: "packing_there", order: 13 },
  { text: "Головной убор", category: "packing_there", order: 14 },
  { text: "Аптечка (обезболивающие, от желудка)", category: "packing_there", order: 15 },
  { text: "Многоразовая бутылка для воды", category: "packing_there", order: 16 },
  { text: "Зарядные устройства", category: "packing_there", order: 17 },
  { text: "Power bank", category: "packing_there", order: 18 },
  { text: "Адаптер розетки (Type A/I)", category: "packing_there", order: 19 },
  { text: "Наушники", category: "packing_there", order: 20 },
  { text: "Фотоаппарат/телефон", category: "packing_there", order: 21 },
  { text: "Сумка/рюкзак", category: "packing_there", order: 22 },

  // Сборы обратно
  { text: "Сувениры и подарки", category: "packing_back", order: 0 },
  { text: "Проверить номер отеля (ничего не забыть)", category: "packing_back", order: 1 },
  { text: "Проверить вылет (время, терминал)", category: "packing_back", order: 2 },
  { text: "Скачать boarding pass", category: "packing_back", order: 3 },
  { text: "Сдать ключи от отеля", category: "packing_back", order: 4 },
  { text: "Обменять оставшиеся юани", category: "packing_back", order: 5 },
  { text: "Проверить багаж (вес)", category: "packing_back", order: 6 },
  { text: "Жидкости в багаж (не ручная кладь)", category: "packing_back", order: 7 },
  { text: "Паспорт в ручную кладь", category: "packing_back", order: 8 },
  { text: "Зарядка в ручную кладь", category: "packing_back", order: 9 },
  { text: "Приехать в аэропорт за 2-3 часа", category: "packing_back", order: 10 },
];

async function main() {
  console.log("🌱 Seeding packing checklist...");
  for (const item of PACKING_ITEMS) {
    await db.checklistItem.create({ data: item });
  }
  console.log(`✓ Created ${PACKING_ITEMS.length} packing items`);
  console.log("Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
