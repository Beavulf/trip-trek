"use client";

import { motion } from "framer-motion";
import { type TripSummary } from "@/lib/types";

export function DailyTip({ trip }: { trip: TripSummary }) {
  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  if (!currentDay) return null;

  // Общие советы для любого города + опциональные tips для известных (не дефолт)
  const cityTips: Record<string, string[]> = {
    guangzhou: [
      "Попробуйте уличную еду на Шансяцзю — чашеобразная лапша и манго саго!",
      "Круиз по Жемчужной реке лучше всего на закате (~18:30-19:00)",
      "На Beijing Road под стеклянным полом видны древние мостовые",
      "Димсамы в Yonghe Palace — классика кантонской кухни",
    ],
    shenzhen: [
      "Смотровая Free Sky на 116 этаже Ping An — билеты от $44",
      "OCT-LOFT — модный район с галереями и % Arabica",
      "Haidilao — хот-пот с легендарным сервисом",
    ],
    hongkong: [
      "Пик Виктория — поднимайтесь на историческом трамвайчике",
      "Симфония огней в 20:00 на набережной Чимсачёй",
      "Lan Kwai Fong — центр ночной жизни Гонконга",
    ],
    macau: [
      "Lord Stow's Bakery — легендарные португальские яичные тарты",
      "Казино можно просто осматривать — это бесплатно!",
      "Rua do Cunha — пешеходная улица с деликатесами",
    ],
    tokyo: [
      "Суши на Цукидзи — самый свежий улов с утра",
      "Сибуя на закате — перекрёсток в огнях",
      "Янака — старый Токио с атмосферой прошлого",
    ],
    paris: [
      "Эйфелева башня — приходите к 18:00 для заката",
      "Латинский квартал — дешёвые бистро и студенческая атмосфера",
      "Монмартр — художники и вид на весь Париж",
    ],
  };

  // Нейтральные советы для неизвестных городов
  const genericTips = [
    "Спросите местных о лучшем месте для обеда — они знают!",
    "Сделайте фото на главную достопримечательность города",
    "Попробуйте местную уличную еду — это самый честный вкус города",
    "Загляните в местную кофейню — там уютнее, чем в сетевых",
    "Пройдитесь пешком утром — города открываются по-другому",
    "Купите сувенир на местном рынке, а не в туристическом магазине",
  ];

  const tips = cityTips[currentDay.cityKey] ?? genericTips;
  const tipIndex = (trip.currentDayNumber - 1) % tips.length;
  const tip = tips[tipIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/30 p-4 relative overflow-hidden"
    >
      <div className="absolute -top-3 -right-3 size-16 rounded-full bg-violet-500/10 blur-xl" />
      <div className="relative flex items-start gap-3">
        <div className="size-10 rounded-xl bg-violet-500/20 grid place-items-center text-xl shrink-0">
          💡
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-0.5">
            Совет дня · {currentDay.city}
          </div>
          <p className="text-sm leading-relaxed">{tip}</p>
        </div>
      </div>
    </motion.div>
  );
}
