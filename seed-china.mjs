// Импорт поездки «Китай» из markdown-плана (upload/Данные для восстановления поездки).
// Гуанчжоу (4 дня) → Шэньчжэнь (3) → Гонконг (4) → Макао (1). Запуск:
//   DATABASE_URL="file:./db/dev.db" node seed-china.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const TRIP_ID = "trip-china-1";
const START = new Date("2026-09-15T00:00:00.000Z");

const CITY = {
  guangzhou: { name: "Гуанчжоу", color: "#f97316" },
  shenzhen: { name: "Шэньчжэнь", color: "#06b6d4" },
  hongkong: { name: "Гонконг", color: "#ec4899" },
  macau: { name: "Макао", color: "#8b5cf6" },
};

const days = [
  {
    n: 1, key: "guangzhou", title: "Прибытие и знакомство с городом",
    summary: "Аэропорт Гуанчжоу Байюнь → отель (Haizhu Square / Beijing Road). Питание: вонтон-лапша, манго саго. Бюджет дня: $30",
    places: [
      { name: "Пешеходная улица Шансяцзю", category: "market", time: "afternoon", lat: 23.1152, lng: 113.2446, address: "Гуанчжоу, Китай", description: "Атмосферная пешеходная улица с традиционной архитектурой и уличной едой." },
      { name: "Храм Большого Будды (Dafo Temple)", category: "temple", time: "evening", lat: 23.1164, lng: 113.2627, address: "Гуанчжоу, Китай", description: "Тихое место для вечерних фото, рядом с Beijing Road." },
    ],
  },
  {
    n: 2, key: "guangzhou", title: "Небоскрёбы и закат на реке",
    summary: "Питание: жареный гусь, димсамы. Бюджет дня: $40 (башня, круиз, еда)",
    places: [
      { name: "Кантонская башня (Canton Tower)", category: "viewpoint", time: "morning", lat: 23.1066, lng: 113.3245, address: "Гуанчжоу, Китай", budget: 5, description: "Подъём на смотровую площадку, билеты ~$5." },
      { name: "Набережная Жемчужной реки и музей пива Чжуцзян", category: "sight", time: "afternoon", lat: 23.1106, lng: 113.2720, address: "Гуанчжоу, Китай", description: "Прогулка по набережной, музей пива с экскурсией и обедом." },
      { name: "Круиз по Жемчужной реке", category: "sight", time: "evening", lat: 23.1130, lng: 113.2650, address: "Гуанчжоу, Китай", description: "Закатный круиз, лучшее время ~18:30–19:00." },
    ],
  },
  {
    n: 3, key: "guangzhou", title: "Атмосферный старый город",
    summary: "Питание: чаоаньский говяжий хот-пот. Бюджет дня: $25 (билеты, еда)",
    places: [
      { name: "Храм предков Чэнь (Chen Clan Academy)", category: "temple", time: "morning", lat: 23.1149, lng: 113.2454, address: "Гуанчжоу, Китай", description: "Образец лингнаньской архитектуры." },
      { name: "Остров Шамянь", category: "sight", time: "afternoon", lat: 23.1068, lng: 113.2376, address: "Гуанчжоу, Китай", description: "Колониальная архитектура, тенистые аллеи." },
      { name: "Пекинская улица (Beijing Road)", category: "market", time: "evening", lat: 23.1181, lng: 113.2639, address: "Гуанчжоу, Китай", description: "Покупки; под стеклянным полом видны древние мостовые." },
    ],
  },
  {
    n: 4, key: "guangzhou", title: "Гастрономический день",
    summary: "Питание: пирожные из яичного белка, суп из сладкого картофеля. Бюджет дня: $30 (музеи, еда)",
    places: [
      { name: "Мемориал Сунь Ятсена", category: "sight", time: "morning", lat: 23.1330, lng: 113.2590, address: "Гуанчжоу, Китай", description: "Историческое место, рядом с Шамянем." },
      { name: "Гастротур по району Ливань", category: "restaurant", time: "afternoon", lat: 23.1250, lng: 113.2400, address: "Гуанчжоу, Китай", description: "Музей и парк Ливань, уличная еда старого Гуанчжоу." },
      { name: "Ресторан Dim Du Dou", category: "restaurant", time: "evening", lat: 23.1120, lng: 113.2500, address: "Гуанчжоу, Китай", description: "Прощальный ужин: традиционные кантонские десерты." },
    ],
  },
  {
    n: 5, key: "shenzhen", title: "Переезд и знакомство с городом",
    summary: "Скоростной поезд Гуанчжоу → Шэньчжэнь 30–40 мин ($5–10), отель Futian/Luohu. Питание: сычуаньский хот-пот Haidilao. Бюджет дня: $50",
    places: [
      { name: "Пешеходная улица Дунмэнь (Dongmen)", category: "market", time: "afternoon", lat: 22.5460, lng: 114.1180, address: "Шэньчжэнь, Китай", description: "Магазины, снэк-бары, уличная еда." },
      { name: "Free Sky 116 — Ping An Finance Centre", category: "viewpoint", time: "evening", lat: 22.5380, lng: 114.0560, address: "Шэньчжэнь, Китай", budget: 44, description: "Смотровая площадка на 116-м этаже, билеты от $44." },
    ],
  },
  {
    n: 6, key: "shenzhen", title: "Искусство и креативные зоны",
    summary: "Питание: местная уличная еда, десерты в кафе. Бюджет дня: $25 (еда, транспорт)",
    places: [
      { name: "Креативный парк OCT-LOFT", category: "park", time: "morning", lat: 22.5320, lng: 113.9880, address: "Шэньчжэнь, Китай", description: "Бывшая промышленная зона — галереи, кафе, магазины. Рядом % Arabica и Старый книжный магазин." },
      { name: "MOCAPE — Музей современного искусства", category: "sight", time: "evening", lat: 22.5470, lng: 114.0260, address: "Шэньчжэнь, Китай", description: "Закат на набережной рядом с музеем." },
    ],
  },
  {
    n: 7, key: "shenzhen", title: "Природа и пляж",
    summary: "Питание: морепродукты, местные закуски. Бюджет дня: $30 (транспорт, еда)",
    places: [
      { name: "Пляж Дамейша (Dameisha)", category: "beach", time: "morning", lat: 22.5940, lng: 114.3070, address: "Шэньчжэнь, Китай", description: "Пляжный район с атмосферой французского курорта, променад и пляжные кафе." },
    ],
  },
  {
    n: 8, key: "hongkong", title: "Переезд и Симфония огней",
    summary: "Паром Шэньчжэнь → Гонконг 1 час ($15–20), отель Tsim Sha Tsui / Central. Питание: димсамы, жареный рис с морепродуктами. Бюджет дня: $35",
    places: [
      { name: "Набережная Чимсачёй (Tsim Sha Tsui Promenade)", category: "sight", time: "afternoon", lat: 22.2940, lng: 114.1690, address: "Гонконг", description: "Виды на небоскрёбы острова Гонконг через залив." },
      { name: "Симфония огней (A Symphony of Lights)", category: "sight", time: "evening", lat: 22.2935, lng: 114.1700, address: "Гонконг", description: "Лазерное шоу на заливе, каждый день в 20:00." },
    ],
  },
  {
    n: 9, key: "hongkong", title: "Пик Виктория и бары",
    summary: "Питание: обед в The Peak Galleria, международная кухня SoHo, коктейли в Ozone (118-й этаж Ritz-Carlton). Бюджет дня: $40",
    places: [
      { name: "Пик Виктория + Sky Terrace 428", category: "viewpoint", time: "morning", lat: 22.2710, lng: 114.1500, address: "Гонконг", description: "Подъём на историческом трамвайчике или автобусе, смотровая Sky Terrace 428." },
      { name: "SoHo: Стаунтон-стрит и Элджин-стрит", category: "bar", time: "evening", lat: 22.2820, lng: 114.1540, address: "Гонконг", description: "Бары, рестораны, бутики." },
    ],
  },
  {
    n: 10, key: "hongkong", title: "Пляж и ночная жизнь",
    summary: "Питание: пляжные кафе, уличная еда ночных рынков. Бюджет дня: $30 (транспорт, еда)",
    places: [
      { name: "Залив Отпор (Repulse Bay)", category: "beach", time: "morning", lat: 22.2380, lng: 114.1970, address: "Гонконг", description: "Пляжный день; альтернатива — Big Wave Bay." },
      { name: "Lan Kwai Fong", category: "bar", time: "evening", lat: 22.2810, lng: 114.1550, address: "Гонконг", description: "Центр ночной жизни Гонконга." },
    ],
  },
  {
    n: 11, key: "hongkong", title: "Свободный день",
    summary: "Питание: местные деликатесы, десерты. Бюджет дня: $35 (покупки, еда)",
    places: [
      { name: "Храмовый рынок Temple Street", category: "market", time: "morning", lat: 22.3040, lng: 114.1700, address: "Гонконг", description: "Сувениры и уличная еда." },
      { name: "Монастырь Чилинь и сад Нан-Лиан", category: "temple", time: "afternoon", lat: 22.3360, lng: 114.2120, address: "Гонконг", description: "Тихие и красивые места — отдых в середине дня." },
    ],
  },
  {
    n: 12, key: "macau", title: "Казино и колониальная атмосфера",
    summary: "Паром Гонконг → Макао 1 час ($15–20), отель Cotai Strip / Old Macau. Питание: португальские яичные тарты, африканская курица. Бюджет дня: $40 (паром, еда, ставки)",
    places: [
      { name: "Деревня Тайпа и Rua do Cunha", category: "market", time: "afternoon", lat: 22.1560, lng: 113.5570, address: "Макао", description: "Португальская архитектура, пешеходная улица с местными деликатесами; Lord Stow's Bakery." },
      { name: "Котай-Стрип: Venetian · Londoner · Parisian · MGM", category: "casino", time: "evening", lat: 22.1480, lng: 113.5600, address: "Макао", budget: 20, description: "Гранд-казино: гондолы Венеции, копия Биг-Бена, Эйфелева башня Parisian, люстры MGM. Вход свободный, ставки $10–20." },
    ],
  },
];

const foods = [
  { name: "Вонтон-лапша", nameCn: "云吞面", city: "Гуанчжоу", place: "Уличные кафе на Шансяцзю", price: "$2–3", emoji: "🍜" },
  { name: "Жареный гусь", nameCn: "烧鹅", city: "Гуанчжоу", place: "Ресторан Bingtang Hugu", price: "$5–7", emoji: "🍗" },
  { name: "Димсамы", nameCn: "点心", city: "Гуанчжоу / Гонконг", place: "Yonghe Palace (Гуанчжоу), Dim Du Dou", price: "$4–6", emoji: "🥟" },
  { name: "Манго саго", nameCn: "芒果西米露", city: "Гуанчжоу", place: "Десертные кафе на Beijing Road", price: "$2–3", emoji: "🥭" },
  { name: "Чаоаньский говяжий хот-пот", nameCn: "潮汕牛肉火锅", city: "Гуанчжоу", place: "Chaozhou Beef Hotpot", price: "$6–8", emoji: "🍲" },
  { name: "Сычуаньский хот-пот", nameCn: "四川火锅", city: "Шэньчжэнь", place: "Haidilao", price: "$8–10", emoji: "🌶️" },
  { name: "Португальские яичные тарты", nameCn: "葡式蛋挞", city: "Макао", place: "Lord Stow's Bakery, Cunha Food Street", price: "$1–2", emoji: "🥧" },
  { name: "Африканская курица", nameCn: "非洲鸡", city: "Макао", place: "Рестораны в Taipa Village", price: "$5–7", emoji: "🍛" },
];

const checklist = [
  "Проверить срок действия паспорта (минимум 6 месяцев)",
  "Оформить медстраховку с покрытием в Китае",
  "Скачать приложения: Maps.me, Dianping, Google Translate (офлайн-пакеты)",
  "Купить eSIM или местную SIM-карту",
  "Подготовить наличные (доллары) для обмена",
  "Уведомить банк о поездке за границу",
  "Сделать копии документов (паспорт, страховка)",
  "Проверить вакцинации (рекомендованы: гепатит А, Б, тиф)",
  "Купить удобную обувь для долгих прогулок",
  "Подготовить солнцезащитный крем и очки",
];

const info = [
  { type: "contact", icon: "📞", title: "Экстренные контакты", content: "Единые службы Китая: 110 — полиция, 120 — скорая, 119 — пожарная.\nПосольство/консульство: сохрани контакты своей страны в Китае.\nМедстраховка: держи под рукой номер полиса и телефон ассистанса.\nОтель: сохрани адрес и телефон на китайском." },
  { type: "transport", icon: "🚇", title: "Транспорт между городами", content: "Гуанчжоу → Шэньчжэнь: скоростной поезд, 30–40 мин, $5–10.\nШэньчжэнь → Гонконг: паром, 1 час, $15–20.\nГонконг → Макао: паром, 1 час, $15–20.\nВнутри городов: метро ($0.5–1), автобусы; в Гонконге — Octopus Card и Star Ferry; в Макао — бесплатные шаттлы казино от паромных терминалов." },
  { type: "food", icon: "🍽️", title: "Кафе и бары с видом", content: "Гуанчжоу: Bingtang Hugu (суп с лапшой, рядом с Canton Tower), Yonghe Palace (димсамы), rooftop-бар на 70-м этаже Canton Tower (нужна бронь).\nШэньчжэнь: % Arabica в OCT-LOFT, бар на 116-м этаже Ping An Finance Centre.\nГонконг: Ozone (118-й этаж Ritz-Carlton, самый высокий бар в мире), Sevva в Central, кафе в The Peak Galleria.\nМакао: The Manor в Taipa Village, The St. Regis Bar, Chiado в The Londoner." },
  { type: "tip", icon: "💡", title: "Практические советы", content: "Связь: eSIM (Airalo) или местная SIM по прилёте.\nПлатежи: Alipay и WeChat Pay везде — привяжи иностранную карту.\nЯзык: на материке путунхуа, в Гонконге и Макао кантонский; английский распространён.\nЕда: ищи кафе через Dianping (китайский Yelp).\nЗдоровье: вода с собой, начинай с малых порций уличной еды, аптечка базовая.\nКазино Макао: открыты 24/7, вход свободный, дресс-код casual; можно просто гулять и смотреть." },
];

const budgetPlans = [
  { category: "accommodation", amount: 400 },
  { category: "food", amount: 300 },
  { category: "transport", amount: 150 },
  { category: "attractions", amount: 100 },
  { category: "casino", amount: 100 },
  { category: "other", amount: 50 },
];

async function main() {
  await prisma.trip.deleteMany({ where: { id: TRIP_ID } });

  const endDate = new Date(START);
  endDate.setDate(endDate.getDate() + 11);

  const trip = await prisma.trip.create({
    data: {
      id: TRIP_ID,
      title: "Китай",
      destination: "Гуанчжоу · Шэньчжэнь · Гонконг · Макао",
      startDate: START,
      endDate,
      totalDays: 12,
      totalBudget: 1100,
      currency: "USD",
      inviteCode: "china2026",
      coverColor: "#dc2626",
      coverEmoji: "🏮",
      status: "planning",
    },
  });

  await prisma.tripMember.create({
    data: { id: "tm-china-1", tripId: TRIP_ID, userId: "demo-user-1", role: "owner", displayName: "You", emoji: "👤", color: "#f97316" },
  });

  let placeCount = 0;
  for (const d of days) {
    const date = new Date(START);
    date.setDate(date.getDate() + (d.n - 1));
    const day = await prisma.day.create({
      data: {
        id: `china-day-${d.n}`,
        tripId: TRIP_ID,
        dayNumber: d.n,
        date,
        city: CITY[d.key].name,
        cityKey: d.key,
        title: d.title,
        summary: d.summary,
        accentColor: CITY[d.key].color,
      },
    });
    for (let i = 0; i < d.places.length; i++) {
      const p = d.places[i];
      await prisma.place.create({
        data: {
          id: `china-place-${d.n}-${i + 1}`,
          tripId: TRIP_ID,
          dayId: day.id,
          name: p.name,
          description: p.description,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          timeOfDay: p.time,
          budget: p.budget ?? null,
          order: i + 1,
        },
      });
      placeCount++;
    }
  }

  await prisma.foodItem.createMany({
    data: foods.map((f, i) => ({ ...f, id: `china-food-${i + 1}`, tripId: TRIP_ID, description: f.place, order: i + 1 })),
  });
  await prisma.checklistItem.createMany({
    data: checklist.map((text, i) => ({ id: `china-check-${i + 1}`, tripId: TRIP_ID, text, category: "preparation", order: i + 1 })),
  });
  await prisma.infoItem.createMany({
    data: info.map((it, i) => ({ ...it, id: `china-info-${i + 1}`, tripId: TRIP_ID, order: i + 1 })),
  });
  await prisma.budgetPlan.createMany({
    data: budgetPlans.map((b) => ({ ...b, id: `china-budget-${b.category}`, tripId: TRIP_ID })),
  });

  console.log(`OK: trip "${trip.title}" — ${days.length} дней, ${placeCount} мест, ${foods.length} блюд, ${checklist.length} пунктов чек-листа, ${info.length} инфо-блоков`);
}

main()
  .catch((e) => { console.error("ERR:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
