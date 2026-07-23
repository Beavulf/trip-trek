import { db } from "../src/lib/db";

const FOODS: Array<{
  name: string; nameCn: string | null; description: string; city: string; place: string | null;
  price: string | null; emoji: string | null; order: number;
}> = [
  // Гуанчжоу
  { name: "Чашеобразная лапша (wonton noodles)", nameCn: "云吞面", description: "Традиционное кантонское блюдо — лапша с клёцками с креветками и свининой. Попробуйте на Шансяцзю.", city: "guangzhou", place: "Уличные кафе на Шансяцзю", price: "$2-3", emoji: "🍜", order: 0 },
  { name: "Жареный гусь", nameCn: "烧鹅", description: "Местное блюдо Гуанчжоу, хрустящая корочка, нежное мясо. Ресторан Bingtang Hugu рядом с Canton Tower.", city: "guangzhou", place: "Bingtang Hugu", price: "$5-7", emoji: "🦆", order: 1 },
  { name: "Димсамы", nameCn: "点心", description: "Кантонские закуски на пару — пельмени, булочки, десерты. Ресторан Yonghe Palace или Dim Du Dou.", city: "guangzhou", place: "Yonghe Palace / Dim Du Dou", price: "$4-6", emoji: "🥟", order: 2 },
  { name: "Манго саго", nameCn: "杨枝甘露", description: "Освежающий десерт из манго, саго и кокосового молока. Десертные кафе на Beijing Road.", city: "guangzhou", place: "Десертные кафе на Beijing Road", price: "$2-3", emoji: "🥭", order: 3 },
  { name: "Чаоаньский говяжий хот-пот", nameCn: "潮汕牛肉火锅", description: "Хот-пот с тонко нарезанной говядиной. Ресторан Chaozhou Beef Hotpot.", city: "guangzhou", place: "Chaozhou Beef Hotpot", price: "$6-8", emoji: "🍲", order: 4 },
  { name: "Пирожные из яичного белка", nameCn: "蛋白糕", description: "Традиционные кантонские десерты в Dim Du Dou.", city: "guangzhou", place: "Dim Du Dou", price: "$2-3", emoji: "🍰", order: 5 },

  // Шэньчжэнь
  { name: "Сычуаньский хот-пот", nameCn: "四川火锅", description: "Острый хот-пот, знаменит сервисом. Haidilao — посещение как шоу.", city: "shenzhen", place: "Haidilao", price: "$8-10", emoji: "🌶️", order: 0 },
  { name: "Спешелти кофе", nameCn: "咖啡", description: "% Arabica в OCT-LOFT — качественный спешелти кофе в креативном парке.", city: "shenzhen", place: "% Arabica OCT-LOFT", price: "$3-4", emoji: "☕", order: 1 },
  { name: "Морепродукты", nameCn: "海鲜", description: "Свежие морепродукты на пляже Дамейша — крабы, креветки, рыба.", city: "shenzhen", place: "Пляжные кафе Dameisha", price: "$10-15", emoji: "🦐", order: 2 },

  // Гонконг
  { name: "Димсамы в Гонконге", nameCn: "点心", description: "Гонконгские димсамы — лучше чем в Гуанчжоу! Попробуйте на завтрак.", city: "hongkong", place: "Рестораны в Central", price: "$5-8", emoji: "🥟", order: 0 },
  { name: "Жареный рис с морепродуктами", nameCn: "海鲜炒饭", description: "Классика гонконгской кухни. В любом ресторане на набережной.", city: "hongkong", place: "Рестораны Tsim Sha Tsui", price: "$5-7", emoji: "🍚", order: 1 },
  { name: "Коктейли в Ozone", nameCn: "鸡尾酒", description: "Самый высокий бар в мире, 118-й этаж Ritz-Carlton. Виды на город.", city: "hongkong", place: "Ozone Bar (Ritz-Carlton)", price: "$20-25", emoji: "🍸", order: 2 },
  { name: "Уличная еда на Temple Street", nameCn: "庙街夜市", description: "Ночной рынок — устрицы, кебабы, десерты. Атмосфера Гонконга.", city: "hongkong", place: "Temple Street Night Market", price: "$3-8", emoji: "🍢", order: 3 },

  // Макао
  { name: "Португальские яичные тарты", nameCn: "葡式蛋挞", description: "Легендарные тарты Lord Stow's Bakery — must-try в Макао!", city: "macau", place: "Lord Stow's Bakery", price: "$1-2", emoji: "🥧", order: 0 },
  { name: "Африканская курица", nameCn: "非洲鸡", description: "Португальское блюдо Макао — курица в остром соусе. Рестораны в Taipa Village.", city: "macau", place: "Рестораны Taipa Village", price: "$5-7", emoji: "🍗", order: 1 },
  { name: "Свинина на косточке", nameCn: "叉烧包", description: "Cha siu bao — булочки со свининой BBQ. В пекарнях Rua do Cunha.", city: "macau", place: "Rua do Cunha", price: "$1-2", emoji: "🥖", order: 2 },
];

async function main() {
  console.log("🌱 Seeding food guide...");
  await db.foodItem.deleteMany();
  for (const f of FOODS) {
    await db.foodItem.create({ data: f });
  }
  console.log(`✓ Created ${FOODS.length} food items`);
  console.log("Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
