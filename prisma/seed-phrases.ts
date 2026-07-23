import { db } from "../src/lib/db";

const PHRASES: Array<{ category: string; ru: string; cn: string; pinyin: string; order: number }> = [
  // Основные
  { category: "basics", ru: "Здравствуйте", cn: "你好", pinyin: "nǐ hǎo", order: 0 },
  { category: "basics", ru: "До свидания", cn: "再见", pinyin: "zàijiàn", order: 1 },
  { category: "basics", ru: "Спасибо", cn: "谢谢", pinyin: "xièxie", order: 2 },
  { category: "basics", ru: "Пожалуйста (просьба)", cn: "请", pinyin: "qǐng", order: 3 },
  { category: "basics", ru: "Извините", cn: "对不起", pinyin: "duìbuqǐ", order: 4 },
  { category: "basics", ru: "Не за что", cn: "不客气", pinyin: "bú kèqi", order: 5 },
  { category: "basics", ru: "Да / Нет", cn: "是 / 不是", pinyin: "shì / bú shì", order: 6 },
  { category: "basics", ru: "Я не понимаю", cn: "我听不懂", pinyin: "wǒ tīng bù dǒng", order: 7 },
  { category: "basics", ru: "Вы говорите по-английски?", cn: "你会说英语吗？", pinyin: "nǐ huì shuō yīngyǔ ma?", order: 8 },
  { category: "basics", ru: "Меня зовут…", cn: "我叫…", pinyin: "wǒ jiào…", order: 9 },
  { category: "basics", ru: "Где туалет?", cn: "洗手间在哪里？", pinyin: "xǐshǒujiān zài nǎlǐ?", order: 10 },
  { category: "basics", ru: "Сколько стоит?", cn: "多少钱？", pinyin: "duōshao qián?", order: 11 },

  // Еда
  { category: "food", ru: "Меню, пожалуйста", cn: "请给我菜单", pinyin: "qǐng gěi wǒ càidān", order: 0 },
  { category: "food", ru: "Я хочу это", cn: "我要这个", pinyin: "wǒ yào zhèige", order: 1 },
  { category: "food", ru: "Вкусно!", cn: "很好吃！", pinyin: "hěn hǎochī!", order: 2 },
  { category: "food", ru: "Счёт, пожалуйста", cn: "买单", pinyin: "mǎidān", order: 3 },
  { category: "food", ru: "Не остро", cn: "不要辣", pinyin: "bú yào là", order: 4 },
  { category: "food", ru: "Острое", cn: "辣的", pinyin: "là de", order: 5 },
  { category: "food", ru: "Вода (кипяток)", cn: "水 / 热水", pinyin: "shuǐ / rè shuǐ", order: 6 },
  { category: "food", ru: "Чай", cn: "茶", pinyin: "chá", order: 7 },
  { category: "food", ru: "Пиво", cn: "啤酒", pinyin: "píjiǔ", order: 8 },
  { category: "food", ru: "Рис", cn: "米饭", pinyin: "mǐfàn", order: 9 },
  { category: "food", ru: "Лапша", cn: "面条", pinyin: "miàntiáo", order: 10 },
  { category: "food", ru: "Без мяса", cn: "不要肉", pinyin: "bú yào ròu", order: 11 },

  // Транспорт
  { category: "transport", ru: "Где метро?", cn: "地铁在哪里？", pinyin: "dìtiě zài nǎlǐ?", order: 0 },
  { category: "transport", ru: "Такси", cn: "出租车", pinyin: "chūzūchē", order: 1 },
  { category: "transport", ru: "Поехали в (отель)", cn: "去… (酒店)", pinyin: "qù… (jiǔdiàn)", order: 2 },
  { category: "transport", ru: "Билет", cn: "票", pinyin: "piào", order: 3 },
  { category: "transport", ru: "Аэропорт", cn: "机场", pinyin: "jīchǎng", order: 4 },
  { category: "transport", ru: "Вокзал", cn: "火车站", pinyin: "huǒchēzhàn", order: 5 },
  { category: "transport", ru: "Прямо / Направо / Налево", cn: "直走 / 右转 / 左转", pinyin: "zhízǒu / yòuzhuǎn / zuǒzhuǎn", order: 6 },
  { category: "transport", ru: "Остановите здесь", cn: "停在这里", pinyin: "tíng zài zhèlǐ", order: 7 },
  { category: "transport", ru: "Паром", cn: "渡轮", pinyin: "dùlún", order: 8 },

  // Покупки
  { category: "shopping", ru: "Можно померить?", cn: "可以试穿吗？", pinyin: "kěyǐ shìchuān ma?", order: 0 },
  { category: "shopping", ru: "Слишком дорого", cn: "太贵了", pinyin: "tài guì le", order: 1 },
  { category: "shopping", ru: "Подешевле можно?", cn: "便宜一点可以吗？", pinyin: "piányi yìdiǎn kěyǐ ma?", order: 2 },
  { category: "shopping", ru: "Я куплю это", cn: "我买了", pinyin: "wǒ mǎi le", order: 3 },
  { category: "shopping", ru: "Можно картой?", cn: "可以刷卡吗？", pinyin: "kěyǐ shuākǎ ma?", order: 4 },
  { category: "shopping", ru: "WeChat Pay / Alipay", cn: "微信支付 / 支付宝", pinyin: "wēixìn zhīfù / zhīfùbǎo", order: 5 },
  { category: "shopping", ru: "Чек", cn: "收据", pinyin: "shōujù", order: 6 },
  { category: "shopping", ru: "Сувенир", cn: "纪念品", pinyin: "jìniànpǐn", order: 7 },

  // Экстренные
  { category: "emergency", ru: "Помогите!", cn: "救命！", pinyin: "jiùmìng!", order: 0 },
  { category: "emergency", ru: "Вызовите полицию", cn: "报警", pinyin: "bàojǐng", order: 1 },
  { category: "emergency", ru: "Вызовите скорую", cn: "叫救护车", pinyin: "jiào jiùhùchē", order: 2 },
  { category: "emergency", ru: "Мне нужен врач", cn: "我需要医生", pinyin: "wǒ xūyào yīshēng", order: 3 },
  { category: "emergency", ru: "Я потерялся", cn: "我迷路了", pinyin: "wǒ mílù le", order: 4 },
  { category: "emergency", ru: "Где посольство?", cn: "大使馆在哪里？", pinyin: "dàshǐguǎn zài nǎlǐ?", order: 5 },
  { category: "emergency", ru: "У меня болит…", cn: "我…疼", pinyin: "wǒ…téng", order: 6 },
  { category: "emergency", ru: "Номер экстренной службы: 110", cn: "报警电话：110", pinyin: "bàojǐng diànhuà: 110", order: 7 },

  // Социальные
  { category: "social", ru: "Откуда ты?", cn: "你是哪里人？", pinyin: "nǐ shì nǎlǐ rén?", order: 0 },
  { category: "social", ru: "Я из России", cn: "我是俄罗斯人", pinyin: "wǒ shì éluósī rén", order: 1 },
  { category: "social", ru: "Очень приятно", cn: "很高兴认识你", pinyin: "hěn gāoxìng rènshi nǐ", order: 2 },
  { category: "social", ru: "Красиво!", cn: "很漂亮！", pinyin: "hěn piàoliang!", order: 3 },
  { category: "social", ru: "Можно фото?", cn: "可以拍照吗？", pinyin: "kěyǐ pāizhào ma?", order: 4 },
  { category: "social", ru: "Давай вместе", cn: "一起吧", pinyin: "yìqǐ ba", order: 5 },
  { category: "social", ru: "Хорошее настроение", cn: "心情很好", pinyin: "xīnqíng hěn hǎo", order: 6 },
];

async function main() {
  console.log("🌱 Seeding phrasebook...");
  await db.phrase.deleteMany();
  for (const p of PHRASES) {
    await db.phrase.create({ data: p });
  }
  console.log(`✓ Created ${PHRASES.length} phrases`);
  console.log("Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
