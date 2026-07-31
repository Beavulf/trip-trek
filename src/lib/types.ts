export interface Participant {
  id: string;
  name: string;
  color: string;
  emoji: string;
  role: string | null;
  budget: number | null;
}

export interface Place {
  id: string;
  name: string;
  description: string | null;
  category: string;
  lat: number;
  lng: number;
  dayId: string;
  timeOfDay: string | null;
  status: "planned" | "visited" | "current";
  budget: number | null;
  address: string | null;
  notes: string | null;
  rating: number | null;
  visitedAt: string | null;
  order: number;
}

export interface Day {
  id: string;
  dayNumber: number;
  date: string;
  city: string;
  cityKey: string;
  title: string;
  summary: string | null;
  accentColor: string | null;
  places: Place[];
  photos: Photo[];
  _count?: { places: number; photos: number; expenses: number };
}

export interface Photo {
  id: string;
  url: string;
  thumbUrl: string | null;
  caption: string | null;
  placeId: string | null;
  dayId: string;
  userId: string | null;
  user: { id: string; name: string; emoji: string; color: string } | null;
  place: Place | null;
  day: { dayNumber: number; city: string; cityKey: string } | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  takenAt: string;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  paidById: string;
  paidBy: Participant;
  dayId: string | null;
  day: { dayNumber: number; city: string } | null;
  splitWith?: string;
  excludeSelf?: boolean;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  dayId: string;
  userId: string | null;
  user: { id: string; name: string; emoji: string; color: string } | null;
  day: { dayNumber: number; city: string } | null;
  mood: string | null;
  content: string;
  createdAt: string;
}

export interface TripSummary {
  settings: {
    id: string;
    title: string;
    startDate: string;
    endDate: string | null;
    totalDays: number;
    totalBudget: number;
    currency: string;
    currentUserId: string | null;
    inviteCode?: string;
    tripId?: string;
  };
  trip?: {
    id: string;
    title: string;
    destination: string;
    inviteCode: string;
    coverColor: string;
    coverEmoji: string;
    status: string;
  };
  participants: Participant[];
  currentDayNumber: number;
  dayProgress: number;
  placeProgress: number;
  visitedPlaces: number;
  totalPlaces: number;
  totalSpent: number;
  remainingBudget: number;
  totalPhotos: number;
  totalJournals: number;
  days: Day[];
}

export interface Weather {
  city: string;
  cityKey: string;
  temperature: number;
  apparent: number;
  humidity: number;
  wind: number;
  code: number;
  label: string;
  emoji: string;
  max: number;
  min: number;
  forecast?: WeatherDay[];
  fallback?: boolean;
}

export interface WeatherDay {
  date: string;
  max: number;
  min: number;
  code: number;
  label: string;
  emoji: string;
  precip: number;
}

export const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  sight: { label: "Достопримечательность", emoji: "🏛️", color: "#f97316" },
  temple: { label: "Храм", emoji: "⛩️", color: "#dc2626" },
  viewpoint: { label: "Смотровая", emoji: "🔭", color: "#7c3aed" },
  beach: { label: "Пляж", emoji: "🏖️", color: "#0891b2" },
  market: { label: "Улица/рынок", emoji: "🛍️", color: "#ea580c" },
  casino: { label: "Казино", emoji: "🎰", color: "#be185d" },
  restaurant: { label: "Ресторан", emoji: "🍽️", color: "#16a34a" },
  cafe: { label: "Кафе", emoji: "☕", color: "#a16207" },
  bar: { label: "Бар", emoji: "🍸", color: "#db2777" },
  hotel: { label: "Отель", emoji: "🏨", color: "#475569" },
  transport: { label: "Транспорт", emoji: "🚄", color: "#0ea5e9" },
  park: { label: "Парк", emoji: "🌳", color: "#15803d" },
};

export const EXPENSE_CATEGORIES: Record<string, { label: string; emoji: string; color: string }> = {
  accommodation: { label: "Проживание", emoji: "🏨", color: "#8b5cf6" },
  food: { label: "Питание", emoji: "🍜", color: "#f97316" },
  transport: { label: "Транспорт", emoji: "🚄", color: "#06b6d4" },
  attractions: { label: "Достопримечательности", emoji: "🎟️", color: "#ec4899" },
  casino: { label: "Казино", emoji: "🎰", color: "#be185d" },
  shopping: { label: "Шопинг", emoji: "🛍️", color: "#84cc16" },
  other: { label: "Прочее", emoji: "💸", color: "#64748b" },
};

export const CITIES = [
  { key: "guangzhou", name: "Гуанчжоу", color: "#f97316", lat: 23.1291, lng: 113.2644 },
  { key: "shenzhen", name: "Шэньчжэнь", color: "#06b6d4", lat: 22.5431, lng: 114.0579 },
  { key: "hongkong", name: "Гонконг", color: "#ec4899", lat: 22.3193, lng: 114.1694 },
  { key: "macau", name: "Макао", color: "#8b5cf6", lat: 22.1987, lng: 113.5439 },
];
