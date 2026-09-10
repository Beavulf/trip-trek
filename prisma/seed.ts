import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

// Канонический dev-сид: демо-пользователи (кнопки входа на /login) + демо-поездка.
//
// Идемпотентность и безопасность:
// - пользователи создаются через upsert по email — пароль демо-аккаунтов
//   гарантированно равен DEMO_PASSWORD после прогона;
// - удаляется ТОЛЬКО демо-поездка (каскад чистит её дни/места/траты/фото/участников).
//   Никаких глобальных deleteMany — данные других поездок не трогаются.
//
// Запуск: bun prisma/seed.ts (или npm run db:seed) с DATABASE_URL.

const DEMO_TRIP_ID = "trip-demo-china";
const DEMO_PASSWORD = "1234";

const DEMO_USERS = [
  { id: "demo-user-1", email: "you@triptrek.com", name: "Ты", emoji: "🦊", color: "#f97316" },
  { id: "demo-user-2", email: "leha@triptrek.com", name: "Лёха", emoji: "🐻", color: "#06b6d4" },
  { id: "demo-user-3", email: "den@triptrek.com", name: "Дэн", emoji: "🐼", color: "#8b5cf6" },
];

// Города и их цвета/координаты
const CITIES = {
  guangzhou: { name: "Гуанчжоу", key: "guangzhou", color: "#f97316", lat: 23.1291, lng: 113.2644 },
  shenzhen: { name: "Шэньчжэнь", key: "shenzhen", color: "#06b6d4", lat: 22.5431, lng: 114.0579 },
  hongkong: { name: "Гонконг", key: "hongkong", color: "#ec4899", lat: 22.3193, lng: 114.1694 },
  macau: { name: "Макао", key: "macau", color: "#8b5cf6", lat: 22.1987, lng: 113.5439 },
};

// Дни и места демо-поездки
const TRIP_DAYS: Array<{
  day: number;
  city: keyof typeof CITIES;
  title: string;
  summary: string;
  places: Array<{
    name: string;
    description: string;
    category: string;
    lat: number;
    lng: number;
    timeOfDay: string;
    budget?: number;
    address?: string;
    order: number;
  }>;
}> = [
  {
    day: 1,
    city: "guangzhou",
    title: "Прибытие и знакомство с городом",
    summary: "Прилёт в аэропорт Байюнь, заселение, прогулка по старинной улице и храм",
    places: [
      { name: "Пешеходная улица Шансяцзю", description: "Атмосферное место с традиционной архитектурой и уличной едой. Попробуйте чашеобразную лапшу и манго саго.", category: "market", lat: 23.1240, lng: 113.2540, timeOfDay: "afternoon", budget: 10, order: 0 },
      { name: "Храм Большого Будды (Dafo Temple)", description: "Тихое место для фото, древний храм в центре города.", category: "temple", lat: 23.1310, lng: 113.2620, timeOfDay: "evening", budget: 0, order: 1 },
    ],
  },
  {
    day: 2,
    city: "guangzhou",
    title: "Небоскрёбы и закат на реке",
    summary: "Кантонская башня, набережная Жемчужной реки, круиз на закате",
    places: [
      { name: "Canton Tower", description: "Подъём на смотровую площадку ~$5. Виды на город и реку.", category: "viewpoint", lat: 23.1066, lng: 113.3245, timeOfDay: "morning", budget: 5, order: 0 },
      { name: "Музей пива Чжуцзян", description: "Экскурсия с дегустацией и обедом.", category: "sight", lat: 23.1030, lng: 113.3300, timeOfDay: "afternoon", budget: 8, order: 1 },
      { name: "Набережная Жемчужной реки", description: "Прогулка вдоль реки, лучшие виды на небоскрёбы.", category: "sight", lat: 23.1070, lng: 113.3200, timeOfDay: "afternoon", budget: 0, order: 2 },
      { name: "Круиз по Жемчужной реке", description: "Закатный круиз ~18:30-19:00. Лучшее время для фото.", category: "sight", lat: 23.1070, lng: 113.3250, timeOfDay: "evening", budget: 15, order: 3 },
      { name: "Bingtang Hugu", description: "Жареный гусь — местное блюдо. Рядом с Canton Tower.", category: "restaurant", lat: 23.1080, lng: 113.3230, timeOfDay: "evening", budget: 7, order: 4 },
    ],
  },
  {
    day: 3,
    city: "guangzhou",
    title: "Атмосферный старый город",
    summary: "Академия клана Чэнь, остров Шамянь, Пекинская улица",
    places: [
      { name: "Храм предков Чэнь (Chen Clan Academy)", description: "Образец лингнаньской архитектуры, резьба, керамика.", category: "sight", lat: 23.1180, lng: 113.2530, timeOfDay: "morning", budget: 3, order: 0 },
      { name: "Остров Шамянь", description: "Колониальная архитектура, тенистые аллеи. Идеально для прогулок.", category: "sight", lat: 23.1040, lng: 113.2390, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Пекинская улица (Beijing Road)", description: "Под стеклянным полом — древние мостовые. Шопинг и еда.", category: "market", lat: 23.1280, lng: 113.2630, timeOfDay: "evening", budget: 12, order: 2 },
      { name: "Yonghe Palace", description: "Димсамы рядом с Beijing Road.", category: "restaurant", lat: 23.1285, lng: 113.2635, timeOfDay: "evening", budget: 5, order: 3 },
    ],
  },
  {
    day: 4,
    city: "guangzhou",
    title: "Гастрономический день и подготовка к переезду",
    summary: "Мемориал Сунь Ятсена, районы Ливан, прощальный ужин",
    places: [
      { name: "Мемориал Сунь Ятсена", description: "Историческое место рядом с Шамянь.", category: "sight", lat: 23.1320, lng: 113.2500, timeOfDay: "morning", budget: 0, order: 0 },
      { name: "Ливанский музей", description: "Кантонская культура и история.", category: "sight", lat: 23.1020, lng: 113.2430, timeOfDay: "afternoon", budget: 2, order: 1 },
      { name: "Ливанский парк", description: "Тихий парк для отдыха.", category: "park", lat: 23.1000, lng: 113.2410, timeOfDay: "afternoon", budget: 0, order: 2 },
      { name: "Dim Du Dou", description: "Традиционные кантонские десерты. Пирожные из яичного белка.", category: "restaurant", lat: 23.1050, lng: 113.2450, timeOfDay: "evening", budget: 6, order: 3 },
    ],
  },
  {
    day: 5,
    city: "shenzhen",
    title: "Переезд и знакомство с городом",
    summary: "Скоростной поезд в Шэньчжэнь, Dongmen, смотровая Ping An",
    places: [
      { name: "Скоростной поезд Гуанчжоу–Шэньчжэнь", description: "30-40 минут, $5-10. Заселение в Futian/Luohu.", category: "transport", lat: 22.6010, lng: 114.0240, timeOfDay: "morning", budget: 8, order: 0 },
      { name: "Пешеходная улица Dongmen", description: "Магазины, снэк-бары, уличная еда.", category: "market", lat: 22.5540, lng: 114.1230, timeOfDay: "afternoon", budget: 10, order: 1 },
      { name: "Free Sky — Ping An Finance Centre", description: "Смотровая на 116-м этаже. Билеты от $44. Панорама города.", category: "viewpoint", lat: 22.5370, lng: 114.0590, timeOfDay: "evening", budget: 44, order: 2 },
      { name: "Haidilao", description: "Сычуаньский хот-пот. Знаменит сервисом.", category: "restaurant", lat: 22.5375, lng: 114.0600, timeOfDay: "evening", budget: 10, order: 3 },
    ],
  },
  {
    day: 6,
    city: "shenzhen",
    title: "Искусство и креативные зоны",
    summary: "OCT-LOFT, спешелти-кофейни, закат у MOCAPE",
    places: [
      { name: "OCT-LOFT (Креативный парк OCT)", description: "Бывшая промзона — модный район с галереями и кафе.", category: "sight", lat: 22.5380, lng: 113.9860, timeOfDay: "morning", budget: 0, order: 0 },
      { name: "% Arabica OCT-LOFT", description: "Спешелти-кофейня в креативном парке.", category: "cafe", lat: 22.5385, lng: 113.9865, timeOfDay: "afternoon", budget: 4, order: 1 },
      { name: "Старый книжный магазин", description: "Кафе с атмосферой, книги и кофе.", category: "cafe", lat: 22.5390, lng: 113.9870, timeOfDay: "afternoon", budget: 3, order: 2 },
      { name: "MOCAPE", description: "Музей современного искусства. Закат на набережной рядом.", category: "sight", lat: 22.5360, lng: 113.9850, timeOfDay: "evening", budget: 6, order: 3 },
    ],
  },
  {
    day: 7,
    city: "shenzhen",
    title: "Природа и пляж",
    summary: "Дамейша — пляжный район с атмосферой французского курорта",
    places: [
      { name: "Пляж Дамейша (Dameisha)", description: "Прогулка по променаду, обед в пляжном кафе. Морепродукты.", category: "beach", lat: 22.5920, lng: 114.3000, timeOfDay: "morning", budget: 15, order: 0 },
    ],
  },
  {
    day: 8,
    city: "hongkong",
    title: "Переезд и Симфония огней",
    summary: "Паром в Гонконг, набережная Чимсачёй, лазерное шоу",
    places: [
      { name: "Паром Шэньчжэнь–Гонконг", description: "1 час, $15-20. Заселение в Tsim Sha Tsui.", category: "transport", lat: 22.2850, lng: 114.1700, timeOfDay: "morning", budget: 18, order: 0 },
      { name: "Набережная Чимсачёй", description: "Виды на небоскрёбы острова Гонконг.", category: "sight", lat: 22.2930, lng: 114.1720, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Симфония огней", description: "Лазерное шоу на заливе в 20:00. Не пропустите!", category: "sight", lat: 22.2935, lng: 114.1725, timeOfDay: "evening", budget: 0, order: 2 },
    ],
  },
  {
    day: 9,
    city: "hongkong",
    title: "Пик Виктория и бары",
    summary: "Исторический трамвайчик, Sky Terrace 428, SoHo, Ozone",
    places: [
      { name: "Пик Виктория (Victoria Peak)", description: "Подъём на историческом трамвайчике или автобусе.", category: "viewpoint", lat: 22.2760, lng: 114.1450, timeOfDay: "morning", budget: 8, order: 0 },
      { name: "Sky Terrace 428", description: "360° виды с самой высокой точки пика.", category: "viewpoint", lat: 22.2760, lng: 114.1455, timeOfDay: "morning", budget: 6, order: 1 },
      { name: "The Peak Galleria", description: "Обед с видом, кафе и магазины.", category: "cafe", lat: 22.2755, lng: 114.1450, timeOfDay: "afternoon", budget: 12, order: 2 },
      { name: "SoHo / Staunton Street", description: "Бары, рестораны, бутики. Международная кухня.", category: "sight", lat: 22.2820, lng: 114.1530, timeOfDay: "evening", budget: 20, order: 3 },
      { name: "Ozone Bar", description: "Самый высокий бар в мире, 118-й этаж Ritz-Carlton. Коктейли.", category: "bar", lat: 22.3050, lng: 114.1610, timeOfDay: "evening", budget: 25, order: 4 },
    ],
  },
  {
    day: 10,
    city: "hongkong",
    title: "Пляж и ночная жизнь",
    summary: "Repulse Bay, Lan Kwai Fong — центр ночной жизни",
    places: [
      { name: "Repulse Bay (Залив Отпор)", description: "Пляж, пляжные кафе. Или Big Wave Bay как альтернатива.", category: "beach", lat: 22.2380, lng: 114.1870, timeOfDay: "morning", budget: 10, order: 0 },
      { name: "Lan Kwai Fong", description: "Центр ночной жизни Гонконга. Бары и клубы.", category: "bar", lat: 22.2810, lng: 114.1550, timeOfDay: "evening", budget: 30, order: 1 },
      { name: "Sevva", description: "Атмосферный бар в Central, виды с террасы.", category: "bar", lat: 22.2815, lng: 114.1555, timeOfDay: "evening", budget: 20, order: 2 },
    ],
  },
  {
    day: 11,
    city: "hongkong",
    title: "Свободный день",
    summary: "Храмовый рынок, монастырь Чилинь, сад Нан-Лиан",
    places: [
      { name: "Монастырь Чилинь", description: "Тихое, красивое место. Деревянная архитектура.", category: "temple", lat: 22.3370, lng: 114.1860, timeOfDay: "morning", budget: 0, order: 0 },
      { name: "Сад Нан-Лиан", description: "Традиционный китайский сад с прудами и беседками.", category: "park", lat: 22.3370, lng: 114.1870, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Temple Street Night Market", description: "Сувениры, уличная еда. Вечерний рынок.", category: "market", lat: 22.3050, lng: 114.1700, timeOfDay: "evening", budget: 15, order: 2 },
    ],
  },
  {
    day: 12,
    city: "macau",
    title: "Казино и колониальная атмосфера",
    summary: "Паром в Макао, Деревня Тайпа, казино на Котай-Стрип",
    places: [
      { name: "Паром Гонконг–Макао", description: "1 час, $15-20. Заселение на Котай-Стрип.", category: "transport", lat: 22.1987, lng: 113.5439, timeOfDay: "morning", budget: 18, order: 0 },
      { name: "Деревня Тайпа (Taipa Village)", description: "Португальская архитектура, кафе, атмосфера.", category: "sight", lat: 22.1500, lng: 113.5540, timeOfDay: "afternoon", budget: 0, order: 1 },
      { name: "Rua do Cunha", description: "Пешеходная улица с местными деликатесами. Яичные тарты!", category: "market", lat: 22.1520, lng: 113.5560, timeOfDay: "afternoon", budget: 8, order: 2 },
      { name: "Lord Stow's Bakery", description: "Легендарные португальские яичные тарты.", category: "cafe", lat: 22.1525, lng: 113.5565, timeOfDay: "afternoon", budget: 2, order: 3 },
      { name: "The Venetian", description: "Копия Венеции с каналами и гондолами.", category: "casino", lat: 22.1470, lng: 113.5590, timeOfDay: "evening", budget: 15, order: 4 },
      { name: "The Londoner", description: "Копия Лондона с Биг-Беном.", category: "casino", lat: 22.1440, lng: 113.5590, timeOfDay: "evening", budget: 15, order: 5 },
      { name: "Parisian", description: "Копия Эйфелевой башни, световое шоу.", category: "casino", lat: 22.1420, lng: 113.5610, timeOfDay: "evening", budget: 15, order: 6 },
      { name: "MGM Cotai", description: "Элегантный интерьер, хрустальная люстра, фонтаны.", category: "casino", lat: 22.1450, lng: 113.5540, timeOfDay: "evening", budget: 15, order: 7 },
    ],
  },
];

// Стартовые траты: paidBy — индекс DEMO_USERS, day — номер дня
const DEMO_EXPENSES = [
  { amount: 30, category: "food", description: "Уличная еда день 1", paidBy: 0, dayNumber: 1 },
  { amount: 40, category: "attractions", description: "Canton Tower + круиз", paidBy: 1, dayNumber: 2 },
  { amount: 25, category: "food", description: "Хот-пот и димсамы день 3", paidBy: 2, dayNumber: 3 },
  { amount: 50, category: "transport", description: "Поезд Гуанчжоу-Шэньчжэнь + смотровая", paidBy: 0, dayNumber: 5 },
  { amount: 35, category: "food", description: "Пляж и морепродукты", paidBy: 1, dayNumber: 7 },
  { amount: 18, category: "transport", description: "Паром в Гонконг", paidBy: 2, dayNumber: 8 },
  { amount: 60, category: "food", description: "SoHo и коктейли", paidBy: 0, dayNumber: 9 },
  { amount: 320, category: "accommodation", description: "Отель Гуанчжоу 4 ночи", paidBy: 1, dayNumber: 1 },
];

async function main() {
  console.log("🌱 Seeding demo data (trip-scoped, idempotent)…");

  // 1. Демо-пользователи — upsert по email (не удаляем: могут быть привязаны
  //    к другим поездкам). Пароль приводим к DEMO_PASSWORD.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    await db.user.upsert({
      where: { email: u.email },
      create: { ...u, password: passwordHash },
      update: { name: u.name, emoji: u.emoji, color: u.color, password: passwordHash },
    });
  }
  console.log(`✓ ${DEMO_USERS.length} demo users (пароль: ${DEMO_PASSWORD})`);

  // 2. Демо-поездка: пересоздаём только её — каскад чистит дни/места/траты/
  //    участников этой поездки, чужие поездки не затрагиваются.
  await db.trip.deleteMany({ where: { id: DEMO_TRIP_ID } });

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const trip = await db.trip.create({
    data: {
      id: DEMO_TRIP_ID,
      title: "Китай: Гуанчжоу — Шэньчжэнь — Гонконг — Макао",
      destination: "Китай",
      startDate,
      totalDays: 12,
      totalBudget: 1100,
      currency: "USD",
      coverColor: "#f97316",
      coverEmoji: "🐼",
      status: "active",
      inviteCode: "demo2026",
    },
  });

  const members = await Promise.all(
    DEMO_USERS.map((u, i) =>
      db.tripMember.create({
        data: {
          tripId: trip.id,
          userId: u.id,
          role: i === 0 ? "owner" : "member",
          displayName: u.name,
          emoji: u.emoji,
          color: u.color,
        },
      })
    )
  );
  console.log(`✓ Trip «${trip.title}» + ${members.length} members (invite: ${trip.inviteCode})`);

  // 3. Дни и места
  let placeCount = 0;
  for (const tripDay of TRIP_DAYS) {
    const city = CITIES[tripDay.city];
    const date = new Date(startDate);
    date.setDate(date.getDate() + tripDay.day - 1);

    const day = await db.day.create({
      data: {
        tripId: trip.id,
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
        data: {
          ...place,
          tripId: trip.id,
          dayId: day.id,
        },
      });
      placeCount++;
    }
  }
  console.log(`✓ ${TRIP_DAYS.length} days, ${placeCount} places`);

  // 4. Стартовые траты для демонстрации бюджета
  for (const exp of DEMO_EXPENSES) {
    const day = await db.day.findFirst({
      where: { tripId: trip.id, dayNumber: exp.dayNumber },
    });
    await db.expense.create({
      data: {
        tripId: trip.id,
        amount: exp.amount,
        category: exp.category,
        description: exp.description,
        paidById: DEMO_USERS[exp.paidBy].id,
        dayId: day?.id,
      },
    });
  }
  console.log(`✓ ${DEMO_EXPENSES.length} expenses`);

  console.log("🌱 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
