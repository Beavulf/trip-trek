// Trip Templates — pre-built trip configurations for quick creation
// Each template includes: title, destination, days with places, budget, foods, phrases

export interface TemplatePlace {
  name: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  budget: number;
  address: string;
}

export interface TemplateDay {
  dayNumber: number;
  city: string;
  cityKey: string;
  title: string;
  summary: string;
  accentColor: string;
  places: TemplatePlace[];
}

export interface TemplateFood {
  name: string;
  nameCn: string;
  description: string;
  city: string;
  price: string;
  emoji: string;
}

export interface TemplatePhrase {
  category: string;
  ru: string;
  cn: string;
  pinyin: string;
}

export interface TripTemplate {
  id: string;
  title: string;
  destination: string;
  coverEmoji: string;
  coverColor: string;
  totalDays: number;
  totalBudget: number;
  description: string;
  days: TemplateDay[];
  foods: TemplateFood[];
  phrases: TemplatePhrase[];
}

export const TRIP_TEMPLATES: TripTemplate[] = [
  {
    id: "china-classic",
    title: "Китай: Гуанчжоу → Шэньчжэнь → Гонконг → Макао",
    destination: "China",
    coverEmoji: "🇨🇳",
    coverColor: "#f97316",
    totalDays: 12,
    totalBudget: 1100,
    description: "Классический маршрут по 4 городам: мегаполисы, храмы, еда, казино",
    days: [
      {
        dayNumber: 1, city: "Гуанчжоу", cityKey: "guangzhou", title: "Прилёт и акклиматизация",
        summary: "Прибытие, заселение, лёгкая прогулка", accentColor: "#f97316",
        places: [
          { name: "Canton Tower", description: "Смотровая башня 600м, вид на город", category: "viewpoint", lat: 23.1066, lng: 113.3245, timeOfDay: "evening", budget: 15, address: "Yuejiang W Rd" },
          { name: "Beijing Road", description: "Пешеходная улица, шопинг", category: "market", lat: 23.1255, lng: 113.2643, timeOfDay: "night", budget: 30, address: "Beijing Rd" },
        ],
      },
      {
        dayNumber: 2, city: "Гуанчжоу", cityKey: "guangzhou", title: "Храмы и парки",
        summary: "Древние храмы, парк Юэсюй", accentColor: "#f97316",
        places: [
          { name: "Храм Шести Баньянов", description: "Древний буддийский храм", category: "temple", lat: 23.1301, lng: 113.2596, timeOfDay: "morning", budget: 5, address: "Liurong Rd" },
          { name: "Парк Юэсюй", description: "Крупнейший парк города, 5 козлов", category: "park", lat: 23.1379, lng: 113.2647, timeOfDay: "afternoon", budget: 0, address: "Jiefang N Rd" },
          { name: "Shangxiajiu", description: "Старая торговая улица", category: "market", lat: 23.1183, lng: 113.2484, timeOfDay: "evening", budget: 40, address: "Shangxiajiu Rd" },
        ],
      },
      {
        dayNumber: 3, city: "Шэньчжэнь", cityKey: "shenzhen", title: "Переезд и технологии",
        summary: "Поезд в Шэньчжэнь, Huaqiangbei", accentColor: "#06b6d4",
        places: [
          { name: "Huaqiangbei", description: "Крупнейший рынок электроники", category: "market", lat: 22.5417, lng: 114.0814, timeOfDay: "afternoon", budget: 100, address: "Huaqiang Rd" },
          { name: "Окно в мир", description: "Тематический парк, миниатюры", category: "sight", lat: 22.5351, lng: 113.9737, timeOfDay: "evening", budget: 25, address: "OCT Rd" },
        ],
      },
    ],
    foods: [
      { name: "Димсам", nameCn: "点心", description: "Кантонские пельмени на пару", city: "Гуанчжоу", price: "$3-5", emoji: "🥟" },
      { name: "Утка по-пекински", nameCn: "北京烤鸭", description: "Хрустящая утка с блинчиками", city: "Гуанчжоу", price: "$15-25", emoji: "🦆" },
      { name: "Hot pot", nameCn: "火锅", description: "Острый суп-фондю", city: "Шэньчжэнь", price: "$10-20", emoji: "🍲" },
      { name: "Char siu", nameCn: "叉烧", description: "Свинина в сладком соусе", city: "Гуанчжоу", price: "$5-8", emoji: "🍖" },
    ],
    phrases: [
      { category: "basics", ru: "Здравствуйте", cn: "你好", pinyin: "nǐ hǎo" },
      { category: "basics", ru: "Спасибо", cn: "谢谢", pinyin: "xiè xie" },
      { category: "food", ru: "Меню, пожалуйста", cn: "请给我菜单", pinyin: "qǐng gěi wǒ càidān" },
      { category: "food", ru: "Очень вкусно!", cn: "很好吃!", pinyin: "hěn hǎo chī!" },
      { category: "transport", ru: "Где метро?", cn: "地铁在哪里?", pinyin: "dìtiě zài nǎlǐ?" },
    ],
  },
  {
    id: "japan-tokyo",
    title: "Япония: Токио и Киото",
    destination: "Japan",
    coverEmoji: "🇯🇵",
    coverColor: "#ec4899",
    totalDays: 10,
    totalBudget: 1500,
    description: "Токио — неон и традиции, Киото — храмы и сады",
    days: [
      {
        dayNumber: 1, city: "Токио", cityKey: "tokyo", title: "Сибуя и Синдзюку",
        summary: "Неоновый Токио, перекрёсток Сибуя", accentColor: "#ec4899",
        places: [
          { name: "Перекрёсток Сибуя", description: "Самый загруженный перекрёсток мира", category: "viewpoint", lat: 35.6595, lng: 139.7004, timeOfDay: "evening", budget: 0, address: "Shibuya" },
          { name: "Синдзюку Гёэн", description: "Большой парк, сакура весной", category: "park", lat: 35.6852, lng: 139.7100, timeOfDay: "afternoon", budget: 3, address: "Shinjuku" },
        ],
      },
      {
        dayNumber: 2, city: "Токио", cityKey: "tokyo", title: "Асакуса и Акихабара",
        summary: "Храм Сенсодзи, электроника", accentColor: "#ec4899",
        places: [
          { name: "Храм Сенсодзи", description: "Древнейший буддийский храм Токио", category: "temple", lat: 35.7148, lng: 139.7967, timeOfDay: "morning", budget: 0, address: "Asakusa" },
          { name: "Акихабара", description: "Район аниме и электроники", category: "market", lat: 35.7022, lng: 139.7745, timeOfDay: "afternoon", budget: 80, address: "Akihabara" },
        ],
      },
    ],
    foods: [
      { name: "Суши", nameCn: "寿司", description: "Свежие суши на Цукидзи", city: "Токио", price: "$10-30", emoji: "🍣" },
      { name: "Рамен", nameCn: "拉面", description: "Свиная лапша в бульоне", city: "Токио", price: "$8-12", emoji: "🍜" },
      { name: "Темпура", nameCn: "天妇罗", description: "Овощи и морепродукты в кляре", city: "Токио", price: "$12-20", emoji: "🍤" },
    ],
    phrases: [
      { category: "basics", ru: "Здравствуйте", cn: "こんにちは", pinyin: "konnichiwa" },
      { category: "basics", ru: "Спасибо", cn: "ありがとうございます", pinyin: "arigatō gozaimasu" },
      { category: "food", ru: "Очень вкусно", cn: "おいしいです", pinyin: "oishī desu" },
    ],
  },
  {
    id: "europe-classic",
    title: "Европа: Париж → Амстердам → Берлин",
    destination: "Europe",
    coverEmoji: "🇪🇺",
    coverColor: "#3b82f6",
    totalDays: 14,
    totalBudget: 2000,
    description: "Классический европейский тур: романтика, каналы, история",
    days: [
      {
        dayNumber: 1, city: "Париж", cityKey: "paris", title: "Эйфелева башня и Сена",
        summary: "Символ Парижа, прогулка по Сене", accentColor: "#3b82f6",
        places: [
          { name: "Эйфелева башня", description: "Символ Парижа, вид с 3 этажа", category: "viewpoint", lat: 48.8584, lng: 2.2945, timeOfDay: "morning", budget: 30, address: "Champ de Mars" },
          { name: "Лувр", description: "Крупнейший музей мира", category: "sight", lat: 48.8606, lng: 2.3376, timeOfDay: "afternoon", budget: 20, address: "Rue de Rivoli" },
        ],
      },
      {
        dayNumber: 2, city: "Париж", cityKey: "paris", title: "Монмартр и Нотр-Дам",
        summary: "Художники Монмартра, готика", accentColor: "#3b82f6",
        places: [
          { name: "Сакре-Кёр", description: "Базилика на холме Монмартр", category: "temple", lat: 48.8867, lng: 2.3431, timeOfDay: "morning", budget: 0, address: "Montmartre" },
          { name: "Монмартр", description: "Квартал художников", category: "market", lat: 48.8867, lng: 2.3431, timeOfDay: "afternoon", budget: 50, address: "Montmartre" },
        ],
      },
    ],
    foods: [
      { name: "Круассан", nameCn: "可颂", description: "Свежая выпечка на завтрак", city: "Париж", price: "$2-4", emoji: "🥐" },
      { name: "Багет", nameCn: "法棍", description: "Свежий французский хлеб", city: "Париж", price: "$1-3", emoji: "🥖" },
      { name: "Стейк-фрит", nameCn: "牛排薯条", description: "Стейк с картошкой фри", city: "Париж", price: "$15-25", emoji: "🥩" },
    ],
    phrases: [
      { category: "basics", ru: "Здравствуйте", cn: "Bonjour", pinyin: "bon-zhoor" },
      { category: "basics", ru: "Спасибо", cn: "Merci", pinyin: "mer-see" },
      { category: "food", ru: "Меню, пожалуйста", cn: "Le menu, s'il vous plaît", pinyin: "le men-yoo seel voo pleh" },
    ],
  },
  {
    id: "thailand-beach",
    title: "Таиланд: Бангкок → Пхукет",
    destination: "Thailand",
    coverEmoji: "🇹🇭",
    coverColor: "#10b981",
    totalDays: 10,
    totalBudget: 800,
    description: "Храмы Бангкока и пляжи Пхукета",
    days: [
      {
        dayNumber: 1, city: "Бангкок", cityKey: "bangkok", title: "Храмы и дворец",
        summary: "Большой дворец, Ват Арун", accentColor: "#10b981",
        places: [
          { name: "Большой дворец", description: "Бывшая резиденция королей", category: "sight", lat: 13.7500, lng: 100.4913, timeOfDay: "morning", budget: 15, address: "Na Phra Lan Rd" },
          { name: "Ват Арун", description: "Храм утренней зари", category: "temple", lat: 13.7437, lng: 100.4889, timeOfDay: "evening", budget: 3, address: "Arun Amarin Rd" },
        ],
      },
      {
        dayNumber: 2, city: "Пхукет", cityKey: "phuket", title: "Пляжи",
        summary: "Пляж Патонг, закат", accentColor: "#10b981",
        places: [
          { name: "Пляж Патонг", description: "Главный пляж, nightlife", category: "beach", lat: 7.8965, lng: 98.2966, timeOfDay: "afternoon", budget: 0, address: "Patong Beach" },
        ],
      },
    ],
    foods: [
      { name: "Пад Тай", nameCn: "泰式炒河粉", description: "Жареная рисовая лапша", city: "Бангкок", price: "$2-4", emoji: "🍜" },
      { name: "Том Ям", nameCn: "冬阴功汤", description: "Острый суп с креветками", city: "Бангкок", price: "$3-5", emoji: "🍲" },
      { name: "Манго стики райс", nameCn: "芒果糯米饭", description: "Сладкий рис с манго", city: "Бангкок", price: "$2-3", emoji: "🥭" },
    ],
    phrases: [
      { category: "basics", ru: "Здравствуйте", cn: "สวัสดี", pinyin: "sà-wàt-dii" },
      { category: "basics", ru: "Спасибо", cn: "ขอบคุณ", pinyin: "kòp-kun" },
    ],
  },
];
