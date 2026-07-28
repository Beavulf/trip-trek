import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

const TRIP_ID = "default-trip";

const TRIP_DAYS: Array<{
  day: number;
  city: keyof typeof CITIES;
  title: string;
  summary: string;
  places: Array<{
    name: string; description: string; category: string;
    lat: number; lng: number; timeOfDay: string; budget?: number; order: number;
  }>;
}> = [
  {
    day: 1, city: "guangzhou", title: "Прибытие и знакомство с городом",
    summary: "Прилёт в аэропорт Байюнь, заселение, прогулка по старинной улице и храм",
    places: [
      { name: "Пешеходная улица Шансяцзю", description: "Атмосферное место с традиционной архитектурой и уличной едой.", category: "market", lat: 23.1240, lng: 113.2540, timeOfDay: "afternoon", budget: 10, order: 0 },
      { name: "Храм Большого Будды (Dafo Temple)", description: "Тихое место для фото, древний храм.", category: "temple", lat: 23.1310, lng: 113.2620, timeOfDay: "evening", budget: 0, order: 1 },
    ],
  },
  {
    day: 2, city: "guangzhou", title: "Небоскрёбы и закат на реке",
    summary: "Кантонская башня, набережная Жемчужной реки, круиз на закате",
    places: [
      { name: "Canton Tower", description: "Подъём на смотровую площадку ~$5.", category: "viewpoint", lat: 23.1066, lng: 113.3245, timeOfDay: "morning", budget: 5, order: 0 },
      { name: "Музей пива Чжуцзян", description: "Экскурсия с дегустацией.", category: "sight", lat: 23.1030, lng: 113.3300, timeOfDay: "afternoon", budget: 8, order: 1 },
      { name: "Набережная Жемчужной реки", description: "Прогулка вдоль реки.", category: "sight", lat: 23.1070, lng: 113.3200, timeOfDay: "afternoon", budget: 0, order: 2 },
      { name: "Круиз по Жемчужной реке", description: "Закатный круиз ~18:30-19:00.", category: "sight", lat: 23.1070, lng: 113.3250, timeOfDay: "evening", budget: 15, order: 3 },
      { name: "Bingtang Hugu", description: "Жареный гусь — местное блюдо.", category: "restaurant", lat: 23.1080, lng: 113.3230, timeOfDay: "evening", budget: 7, order: 4 },
    ],
  },
  {
    day: 3, city: "guangzhou", title: "Атмосферный старый город",
    summary: "Академия клана Чэнь, остров Шамянь, Пекинская улица",
    places: [
      { name: "Храм предков Чэнь (Chen Clan Academy)", description: "Образец лингнаньской архитектуры.", category: "sight", lat: 23.1180, lng: 113.2530, timeOfDay: "morning", budget: 3, order: 0 },
      { name: "Остров Шамянь", description: "Колониальная архитектура.", category: "sight", lat: 23.1040, lng: 113.2390, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Пекинская улица (Beijing Road)", description: "Под стеклянным полом — древние мостовые.", category: "market", lat: 23.1280, lng: 113.2630, timeOfDay: "evening", budget: 12, order: 2 },
      { name: "Yonghe Palace", description: "Димсамы рядом с Beijing Road.", category: "restaurant", lat: 23.1285, lng: 113.2635, timeOfDay: "evening", budget: 5, order: 3 },
    ],
  },
  {
    day: 4, city: "guangzhou", title: "Гастрономический день и подготовка к переезду",
    summary: "Мемориал Сунь Ятсена, районы Ливан, прощальный ужин",
    places: [
      { name: "Мемориал Сунь Ятсена", description: "Историческое место рядом с Шамянь.", category: "sight", lat: 23.1320, lng: 113.2500, timeOfDay: "morning", budget: 0, order: 0 },
      { name: "Ливанский музей", description: "Кантонская культура и история.", category: "sight", lat: 23.1020, lng: 113.2430, timeOfDay: "afternoon", budget: 2, order: 1 },
      { name: "Ливанский парк", description: "Тихий парк для отдыха.", category: "park", lat: 23.1000, lng: 113.2410, timeOfDay: "afternoon", budget: 0, order: 2 },
      { name: "Dim Du Dou", description: "Традиционные кантонские десерты.", category: "restaurant", lat: 23.1050, lng: 113.2450, timeOfDay: "evening", budget: 6, order: 3 },
    ],
  },
  {
    day: 5, city: "shenzhen", title: "Переезд и знакомство с городом",
    summary: "Скоростной поезд в Шэньчжэнь, Dongmen, смотровая Ping An",
    places: [
      { name: "Скоростной поезд Гуанчжоу–Шэньчжэнь", description: "30-40 минут, $5-10.", category: "transport", lat: 22.6010, lng: 114.0240, timeOfDay: "morning", budget: 8, order: 0 },
      { name: "Пешеходная улица Dongmen", description: "Магазины, снэк-бары, уличная еда.", category: "market", lat: 22.5540, lng: 114.1230, timeOfDay: "afternoon", budget: 10, order: 1 },
      { name: "Free Sky — Ping An Finance Centre", description: "Смотровая на 116-м этаже.", category: "viewpoint", lat: 22.5370, lng: 114.0590, timeOfDay: "evening", budget: 44, order: 2 },
      { name: "Haidilao", description: "Сычуаньский хот-пот. Знаменит сервисом.", category: "restaurant", lat: 22.5375, lng: 114.0600, timeOfDay: "evening", budget: 10, order: 3 },
    ],
  },
  {
    day: 6, city: "shenzhen", title: "Искусство и креативные зоны",
    summary: "OCT-LOFT, спешелти-кофейни, закат у MOCAPE",
    places: [
      { name: "OCT-LOFT (Креативный парк OCT)", description: "Бывшая промзона — модный район.", category: "sight", lat: 22.5380, lng: 113.9860, timeOfDay: "morning", budget: 0, order: 0 },
      { name: "% Arabica OCT-LOFT", description: "Спешелти-кофейня.", category: "cafe", lat: 22.5385, lng: 113.9865, timeOfDay: "afternoon", budget: 4, order: 1 },
      { name: "MOCAPE", description: "Музей современного искусства.", category: "sight", lat: 22.5360, lng: 113.9850, timeOfDay: "evening", budget: 6, order: 2 },
    ],
  },
  {
    day: 7, city: "shenzhen", title: "Природа и пляж",
    summary: "Дамейша — пляжный район",
    places: [
      { name: "Пляж Дамейша (Dameisha)", description: "Прогулка по променаду, обед в пляжном кафе.", category: "beach", lat: 22.5920, lng: 114.3000, timeOfDay: "morning", budget: 15, order: 0 },
    ],
  },
  {
    day: 8, city: "hongkong", title: "Переезд и Симфония огней",
    summary: "Паром в Гонконг, набережная Чимсачёй, лазерное шоу",
    places: [
      { name: "Паром Шэньчжэнь–Гонконг", description: "1 час, $15-20.", category: "transport", lat: 22.2850, lng: 114.1700, timeOfDay: "morning", budget: 18, order: 0 },
      { name: "Набережная Чимсачёй", description: "Виды на небоскрёбы острова Гонконг.", category: "sight", lat: 22.2930, lng: 114.1720, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Симфония огней", description: "Лазерное шоу на заливе в 20:00.", category: "sight", lat: 22.2935, lng: 114.1725, timeOfDay: "evening", budget: 0, order: 2 },
    ],
  },
  {
    day: 9, city: "hongkong", title: "Пик Виктория и бары",
    summary: "Исторический трамвайчик, Sky Terrace 428, SoHo, Ozone",
    places: [
      { name: "Пик Виктория (Victoria Peak)", description: "Подъём на историческом трамвайчике.", category: "viewpoint", lat: 22.2760, lng: 114.1450, timeOfDay: "morning", budget: 8, order: 0 },
      { name: "Sky Terrace 428", description: "360° виды.", category: "viewpoint", lat: 22.2760, lng: 114.1455, timeOfDay: "morning", budget: 6, order: 1 },
      { name: "SoHo / Staunton Street", description: "Бары, рестораны, бутики.", category: "sight", lat: 22.2820, lng: 114.1530, timeOfDay: "evening", budget: 20, order: 3 },
      { name: "Ozone Bar", description: "Самый высокий бар в мире, 118-й этаж Ritz-Carlton.", category: "bar", lat: 22.3050, lng: 114.1610, timeOfDay: "evening", budget: 25, order: 4 },
    ],
  },
  {
    day: 10, city: "hongkong", title: "Пляж и ночная жизнь",
    summary: "Repulse Bay, Lan Kwai Fong — центр ночной жизни",
    places: [
      { name: "Repulse Bay (Залив Отпор)", description: "Пляж, пляжные кафе.", category: "beach", lat: 22.2380, lng: 114.1870, timeOfDay: "morning", budget: 10, order: 0 },
      { name: "Lan Kwai Fong", description: "Центр ночной жизни Гонконга.", category: "bar", lat: 22.2810, lng: 114.1550, timeOfDay: "evening", budget: 30, order: 1 },
      { name: "Sevva", description: "Атмосферный бар в Central.", category: "bar", lat: 22.2815, lng: 114.1555, timeOfDay: "evening", budget: 20, order: 2 },
    ],
  },
  {
    day: 11, city: "hongkong", title: "Свободный день",
    summary: "Храмовый рынок, монастырь Чилинь, сад Нан-Лиан",
    places: [
      { name: "Монастырь Чилинь", description: "Тихое, красивое место.", category: "temple", lat: 22.3370, lng: 114.1860, timeOfDay: "morning", budget: 0, order: 0 },
      { name: "Сад Нан-Лиан", description: "Традиционный китайский сад.", category: "park", lat: 22.3370, lng: 114.1870, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Temple Street Night Market", description: "Сувениры, уличная еда.", category: "market", lat: 22.3050, lng: 114.1700, timeOfDay: "evening", budget: 15, order: 2 },
    ],
  },
  {
    day: 12, city: "macau", title: "Казино и колониальная атмосфера",
    summary: "Паром в Макао, Деревня Тайпа, казино на Котай-Стрип",
    places: [
      { name: "Паром Гонконг–Макао", description: "1 час, $15-20.", category: "transport", lat: 22.1987, lng: 113.5439, timeOfDay: "morning", budget: 18, order: 0 },
      { name: "Деревня Тайпа (Taipa Village)", description: "Португальская архитектура, кафе.", category: "sight", lat: 22.1500, lng: 113.5540, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Rua do Cunha", description: "Пешеходная улица с местными деликатесами.", category: "market", lat: 22.1520, lng: 113.5560, timeOfDay: "afternoon", budget: 8, order: 2 },
      { name: "The Venetian", description: "Копия Венеции с каналами и гондолами.", category: "casino", lat: 22.1470, lng: 113.5590, timeOfDay: "evening", budget: 15, order: 4 },
      { name: "The Londoner", description: "Копия Лондона с Биг-Беном.", category: "casino", lat: 22.1440, lng: 113.5590, timeOfDay: "evening", budget: 15, order: 5 },
    ],
  },
];

const CITIES: Record<string, { name: string; key: string; color: string }> = {
  guangzhou: { name: "Гуанчжоу", key: "guangzhou", color: "#f97316" },
  shenzhen: { name: "Шэньчжэнь", key: "shenzhen", color: "#06b6d4" },
  hongkong: { name: "Гонконг", key: "hongkong", color: "#ec4899" },
  macau: { name: "Макао", key: "macau", color: "#8b5cf6" },
};

async function main() {
  console.log("🌱 Seeding trip data...");

  // Очистка контента (не трогаем Trip/User/TripMember)
  await db.photo.deleteMany();
  await db.expense.deleteMany();
  await db.journalEntry.deleteMany();
  await db.place.deleteMany();
  await db.day.deleteMany();
  await db.checklistItem.deleteMany();
  await db.infoItem.deleteMany();
  await db.phrase.deleteMany();
  await db.foodItem.deleteMany();
  await db.budgetPlan.deleteMany();

  // Получаем участников поездки
  const members = await db.tripMember.findMany({ where: { tripId: TRIP_ID }, include: { user: true } });

  // Дни и места
  let placeCount = 0;
  for (const tripDay of TRIP_DAYS) {
    const city = CITIES[tripDay.city];
    const date = new Date();
    date.setDate(date.getDate() + tripDay.day - 1);

    const day = await db.day.create({
      data: {
        tripId: TRIP_ID,
        dayNumber: tripDay.day,
        date,
        city: city.name,
        cityKey: city.key,
        title: tripDay.title,
        summary: tripDay.summary,
        accentColor: city.color,
      },
    });

    for (const place of tripDay.places) {
      await db.place.create({
        data: { ...place, tripId: TRIP_ID, dayId: day.id },
      });
      placeCount++;
    }
  }
  console.log(`✓ ${TRIP_DAYS.length} days, ${placeCount} places`);

  // Траты
  const expenses = [
    { amount: 30, category: "food", description: "Уличная еда день 1", paidById: members[0].userId, dayNumber: 1 },
    { amount: 40, category: "attractions", description: "Canton Tower + круиз", paidById: members[1].userId, dayNumber: 2 },
    { amount: 25, category: "food", description: "Хот-пот и димсамы", paidById: members[2].userId, dayNumber: 3 },
    { amount: 50, category: "transport", description: "Поезд + смотровая", paidById: members[0].userId, dayNumber: 5 },
    { amount: 35, category: "food", description: "Пляж и морепродукты", paidById: members[1].userId, dayNumber: 7 },
    { amount: 18, category: "transport", description: "Паром в Гонконг", paidById: members[2].userId, dayNumber: 8 },
    { amount: 60, category: "food", description: "SoHo и коктейли", paidById: members[0].userId, dayNumber: 9 },
    { amount: 320, category: "accommodation", description: "Отель Гуанчжоу 4 ночи", paidById: members[1].userId, dayNumber: 1 },
  ];
  for (const exp of expenses) {
    const day = await db.day.findFirst({ where: { tripId: TRIP_ID, dayNumber: exp.dayNumber } });
    await db.expense.create({
      data: { amount: exp.amount, category: exp.category, description: exp.description, paidById: exp.paidById, tripId: TRIP_ID, dayId: day?.id },
    });
  }
  console.log(`✓ ${expenses.length} expenses`);

  // Чек-лист
  const checklist = [
    { text: "Проверить срок действия паспорта (минимум 6 месяцев)", category: "documents", order: 0 },
    { text: "Оформить медстраховку с покрытием в Китае", category: "documents", order: 1 },
    { text: "Сделать копии документов", category: "documents", order: 2 },
    { text: "Скачать приложения: Maps.me, Dianping, Google Translate", category: "preparation", order: 0 },
    { text: "Купить eSIM (Airalo) или местную SIM-карту", category: "preparation", order: 1 },
    { text: "Подготовить наличные (доллары)", category: "preparation", order: 2 },
    { text: "Проверить вакцинации", category: "health", order: 0 },
    { text: "Собрать аптечку", category: "health", order: 1 },
    { text: "Купить солнцезащитный крем", category: "health", order: 2 },
    { text: "Одежда на 12 дней", category: "packing_there", order: 0 },
    { text: "Удобная обувь", category: "packing_there", order: 1 },
    { text: "Зарядные устройства + power bank", category: "packing_there", order: 2 },
    { text: "Сувениры и подарки", category: "packing_back", order: 0 },
    { text: "Проверить вылет", category: "packing_back", order: 1 },
    { text: "Сдать ключи от отеля", category: "packing_back", order: 2 },
  ];
  for (const item of checklist) {
    await db.checklistItem.create({ data: { ...item, tripId: TRIP_ID } });
  }
  console.log(`✓ ${checklist.length} checklist items`);

  // Инфо
  const infoItems = [
    { type: "contact", title: "Единый номер экстренных служб", content: "110 — полиция, 120 — скорая, 119 — пожарная", icon: "🚨", order: 0 },
    { type: "transport", title: "Метро в Гуанчжоу и Шэньчжэне", content: "$0.5-1 за поездку. Приложения: Metro Man, Citymapper.", icon: "🚇", order: 0 },
    { type: "transport", title: "Между городами", content: "Гуанчжоу→Шэньчжэнь: поезд 30-40 мин. Шэньчжэнь→Гонконг: паром 1ч. Гонконг→Макао: паром 1ч.", icon: "🚄", order: 1 },
    { type: "tip", title: "Платежи", content: "Alipay и WeChat Pay принимаются везде.", icon: "💳", order: 0 },
    { type: "tip", title: "Язык", content: "В Гуанчжоу и Шэньчжэне — путунхуа, в Гонконге и Макао — кантонский.", icon: "🗣️", order: 1 },
  ];
  for (const item of infoItems) {
    await db.infoItem.create({ data: { ...item, tripId: TRIP_ID } });
  }
  console.log(`✓ ${infoItems.length} info items`);

  // Фразы (сокращённо — первые 20)
  const phrases = [
    { category: "basics", ru: "Здравствуйте", cn: "你好", pinyin: "nǐ hǎo", order: 0 },
    { category: "basics", ru: "Спасибо", cn: "谢谢", pinyin: "xièxie", order: 1 },
    { category: "basics", ru: "Сколько стоит?", cn: "多少钱？", pinyin: "duōshao qián?", order: 2 },
    { category: "basics", ru: "Где туалет?", cn: "洗手间在哪里？", pinyin: "xǐshǒujiān zài nǎlǐ?", order: 3 },
    { category: "food", ru: "Счёт, пожалуйста", cn: "买单", pinyin: "mǎidān", order: 0 },
    { category: "food", ru: "Не остро", cn: "不要辣", pinyin: "bú yào là", order: 1 },
    { category: "transport", ru: "Такси", cn: "出租车", pinyin: "chūzūchē", order: 0 },
    { category: "transport", ru: "Где метро?", cn: "地铁在哪里？", pinyin: "dìtiě zài nǎlǐ?", order: 1 },
    { category: "shopping", ru: "Слишком дорого", cn: "太贵了", pinyin: "tài guì le", order: 0 },
    { category: "emergency", ru: "Помогите!", cn: "救命！", pinyin: "jiùmìng!", order: 0 },
    { category: "social", ru: "Можно фото?", cn: "可以拍照吗？", pinyin: "kěyǐ pāizhào ma?", order: 0 },
  ];
  for (const p of phrases) {
    await db.phrase.create({ data: { ...p, tripId: TRIP_ID } });
  }
  console.log(`✓ ${phrases.length} phrases`);

  // Бюджет-план
  const budgetPlans = [
    { category: "accommodation", amount: 400 },
    { category: "food", amount: 300 },
    { category: "transport", amount: 150 },
    { category: "attractions", amount: 100 },
    { category: "casino", amount: 100 },
  ];
  for (const bp of budgetPlans) {
    await db.budgetPlan.create({ data: { ...bp, tripId: TRIP_ID } });
  }
  console.log(`✓ ${budgetPlans.length} budget plans`);

  console.log("🌱 Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
