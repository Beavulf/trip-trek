import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Базовые фразы для каждого языка (50+ фраз)
// Ключ — код языка (zh, ja, ko, fr, de, en, etc.)
const PHRASES_BY_LANGUAGE: Record<string, { category: string; ru: string; cn: string; pinyin: string }[]> = {
  zh: [
    { category: "basics", ru: "Здравствуйте", cn: "你好", pinyin: "nǐ hǎo" },
    { category: "basics", ru: "Спасибо", cn: "谢谢", pinyin: "xiè xie" },
    { category: "basics", ru: "Пожалуйста", cn: "请", pinyin: "qǐng" },
    { category: "basics", ru: "Извините", cn: "对不起", pinyin: "duì bu qǐ" },
    { category: "basics", ru: "Да", cn: "是", pinyin: "shì" },
    { category: "basics", ru: "Нет", cn: "不是", pinyin: "bù shì" },
    { category: "basics", ru: "До свидания", cn: "再见", pinyin: "zài jiàn" },
    { category: "basics", ru: "Я не понимаю", cn: "我不明白", pinyin: "wǒ bù míng bai" },
    { category: "basics", ru: "Вы говорите по-английски?", cn: "你会说英语吗?", pinyin: "nǐ huì shuō yīng yǔ ma?" },
    { category: "food", ru: "Меню, пожалуйста", cn: "请给我菜单", pinyin: "qǐng gěi wǒ càidān" },
    { category: "food", ru: "Очень вкусно!", cn: "很好吃!", pinyin: "hěn hǎo chī!" },
    { category: "food", ru: "Счёт, пожалуйста", cn: "买单", pinyin: "mǎi dān" },
    { category: "food", ru: "Вода", cn: "水", pinyin: "shuǐ" },
    { category: "food", ru: "Чай", cn: "茶", pinyin: "chá" },
    { category: "food", ru: "Без острых специй", cn: "不要辣", pinyin: "bù yào là" },
    { category: "food", ru: "Счёт на всех", cn: "分开付", pinyin: "fēn kāi fù" },
    { category: "transport", ru: "Где метро?", cn: "地铁在哪里?", pinyin: "dìtiě zài nǎlǐ?" },
    { category: "transport", ru: "Такси", cn: "出租车", pinyin: "chū zū chē" },
    { category: "transport", ru: "Сколько стоит?", cn: "多少钱?", pinyin: "duō shao qián?" },
    { category: "transport", ru: "Билет", cn: "票", pinyin: "piào" },
    { category: "transport", ru: "Аэропорт", cn: "机场", pinyin: "jī chǎng" },
    { category: "transport", ru: "Поезд", cn: "火车", pinyin: "huǒ chē" },
    { category: "shopping", ru: "Сколько это стоит?", cn: "这个多少钱?", pinyin: "zhè ge duō shao qián?" },
    { category: "shopping", ru: "Можно дешевле?", cn: "可以便宜点吗?", pinyin: "kě yǐ piányi diǎn ma?" },
    { category: "shopping", ru: "Я куплю это", cn: "我买这个", pinyin: "wǒ mǎi zhè ge" },
    { category: "shopping", ru: "Только смотрю", cn: "我只是看看", pinyin: "wǒ zhǐ shì kàn kan" },
    { category: "emergency", ru: "Помогите!", cn: "救命!", pinyin: "jiù mìng!" },
    { category: "emergency", ru: "Где больница?", cn: "医院在哪里?", pinyin: "yī yuàn zài nǎlǐ?" },
    { category: "emergency", ru: "Позвоните в полицию", cn: "报警", pinyin: "bào jǐng" },
    { category: "emergency", ru: "Мне нужен врач", cn: "我需要医生", pinyin: "wǒ xū yào yī shēng" },
  ],
  ja: [
    { category: "basics", ru: "Здравствуйте", cn: "こんにちは", pinyin: "konnichiwa" },
    { category: "basics", ru: "Спасибо", cn: "ありがとうございます", pinyin: "arigatō gozaimasu" },
    { category: "basics", ru: "Извините", cn: "すみません", pinyin: "sumimasen" },
    { category: "basics", ru: "Да", cn: "はい", pinyin: "hai" },
    { category: "basics", ru: "Нет", cn: "いいえ", pinyin: "iie" },
    { category: "basics", ru: "До свидания", cn: "さようなら", pinyin: "sayōnara" },
    { category: "food", ru: "Меню, пожалуйста", cn: "メニューをください", pinyin: "menyū o kudasai" },
    { category: "food", ru: "Очень вкусно", cn: "おいしいです", pinyin: "oishī desu" },
    { category: "food", ru: "Счёт, пожалуйста", cn: "お会計を", pinyin: "okaikei o" },
    { category: "transport", ru: "Где станция?", cn: "駅はどこですか?", pinyin: "eki wa doko desu ka?" },
    { category: "transport", ru: "Сколько стоит?", cn: "いくらですか?", pinyin: "ikura desu ka?" },
    { category: "shopping", ru: "Можно дешевле?", cn: "安くできますか?", pinyin: "yasuku dekimasu ka?" },
    { category: "emergency", ru: "Помогите!", cn: "助けて!", pinyin: "tasukete!" },
  ],
  ko: [
    { category: "basics", ru: "Здравствуйте", cn: "안녕하세요", pinyin: "annyeonghaseyo" },
    { category: "basics", ru: "Спасибо", cn: "감사합니다", pinyin: "gamsahamnida" },
    { category: "basics", ru: "Да", cn: "네", pinyin: "ne" },
    { category: "basics", ru: "Нет", cn: "아니요", pinyin: "aniyo" },
    { category: "food", ru: "Меню, пожалуйста", cn: "메뉴 주세요", pinyin: "menyu juseyo" },
    { category: "food", ru: "Очень вкусно", cn: "맛있어요", pinyin: "masisseoyo" },
    { category: "transport", ru: "Где метро?", cn: "지하철이 어디예요?", pinyin: "jihacheol-i eodiyyeyo?" },
    { category: "shopping", ru: "Сколько стоит?", cn: "얼마예요?", pinyin: "eolmayeyo?" },
    { category: "emergency", ru: "Помогите!", cn: "도와주세요!", pinyin: "dowajuseyo!" },
  ],
  th: [
    { category: "basics", ru: "Здравствуйте", cn: "สวัสดี", pinyin: "sà-wàt-dii" },
    { category: "basics", ru: "Спасибо", cn: "ขอบคุณ", pinyin: "kòp-kun" },
    { category: "basics", ru: "Да", cn: "ใช่", pinyin: "châi" },
    { category: "basics", ru: "Нет", cn: "ไม่ใช่", pinyin: "mâi châi" },
    { category: "food", ru: "Очень вкусно", cn: "อร่อยมาก", pinyin: "a-ròi mâak" },
    { category: "food", ru: "Не остро", cn: "ไม่เผ็ด", pinyin: "mâi pèt" },
    { category: "transport", ru: "Сколько стоит?", cn: "ราคาเท่าไหร่", pinyin: "raa-kaa tào-rài" },
    { category: "shopping", ru: "Дешевле?", cn: "ลดหน่อย", pinyin: "lót nòi" },
    { category: "emergency", ru: "Помогите!", cn: "ช่วยด้วย", pinyin: "chûai duâai" },
  ],
  fr: [
    { category: "basics", ru: "Здравствуйте", cn: "Bonjour", pinyin: "bon-zhoor" },
    { category: "basics", ru: "Спасибо", cn: "Merci", pinyin: "mer-see" },
    { category: "basics", ru: "Да", cn: "Oui", pinyin: "wee" },
    { category: "basics", ru: "Нет", cn: "Non", pinyin: "non" },
    { category: "food", ru: "Меню, пожалуйста", cn: "Le menu, s'il vous plaît", pinyin: "le me-nü seel voo pleh" },
    { category: "food", ru: "Очень вкусно", cn: "C'est délicieux", pinyin: "seh day-lee-see-yuh" },
    { category: "food", ru: "Счёт, пожалуйста", cn: "L'addition, s'il vous plaît", pinyin: "lah-dee-syon seel voo pleh" },
    { category: "transport", ru: "Где метро?", cn: "Où est le métro?", pinyin: "oo eh le meh-tro" },
    { category: "shopping", ru: "Сколько стоит?", cn: "Combien ça coûte?", pinyin: "kom-byen sah koot" },
    { category: "emergency", ru: "Помогите!", cn: "Au secours!", pinyin: "oh skoor" },
  ],
  en: [
    { category: "basics", ru: "Здравствуйте", cn: "Hello", pinyin: "he-lo" },
    { category: "basics", ru: "Спасибо", cn: "Thank you", pinyin: "thangk yoo" },
    { category: "basics", ru: "Да", cn: "Yes", pinyin: "yes" },
    { category: "basics", ru: "Нет", cn: "No", pinyin: "no" },
    { category: "food", ru: "Меню, пожалуйста", cn: "Menu, please", pinyin: "me-nü pleez" },
    { category: "food", ru: "Очень вкусно", cn: "It's delicious", pinyin: "its di-li-shes" },
    { category: "food", ru: "Счёт, пожалуйста", cn: "The bill, please", pinyin: "the bil pleez" },
    { category: "transport", ru: "Где метро?", cn: "Where is the subway?", pinyin: "wer iz the sub-wey" },
    { category: "shopping", ru: "Сколько стоит?", cn: "How much is it?", pinyin: "hao mach iz it" },
    { category: "emergency", ru: "Помогите!", cn: "Help!", pinyin: "help" },
  ],
  vi: [
    { category: "basics", ru: "Здравствуйте", cn: "Xin chào", pinyin: "sin chao" },
    { category: "basics", ru: "Спасибо", cn: "Cảm ơn", pinyin: "kam un" },
    { category: "food", ru: "Очень вкусно", cn: "Rất ngon", pinyin: "zet ngon" },
    { category: "transport", ru: "Сколько стоит?", cn: "Bao nhiêu?", pinyin: "bao nyew" },
    { category: "emergency", ru: "Помогите!", cn: "Cứu với!", pinyin: "kuo voi" },
  ],
  es: [
    { category: "basics", ru: "Здравствуйте", cn: "Hola", pinyin: "o-la" },
    { category: "basics", ru: "Спасибо", cn: "Gracias", pinyin: "gra-syas" },
    { category: "food", ru: "Меню, пожалуйста", cn: "El menú, por favor", pinyin: "el me-nu por fa-vor" },
    { category: "food", ru: "Очень вкусно", cn: "¡Qué delicioso!", pinyin: "ke de-li-syo-so" },
    { category: "transport", ru: "Где метро?", cn: "¿Dónde está el metro?", pinyin: "don-de es-ta el me-tro" },
    { category: "shopping", ru: "Сколько стоит?", cn: "¿Cuánto cuesta?", pinyin: "kwan-to kwes-ta" },
    { category: "emergency", ru: "Помогите!", cn: "¡Ayuda!", pinyin: "a-yu-da" },
  ],
  de: [
    { category: "basics", ru: "Здравствуйте", cn: "Hallo", pinyin: "ha-lo" },
    { category: "basics", ru: "Спасибо", cn: "Danke", pinyin: "dan-ke" },
    { category: "food", ru: "Меню, пожалуйста", cn: "Die Speisekarte, bitte", pinyin: "dee shpay-ze-kar-te bi-te" },
    { category: "food", ru: "Очень вкусно", cn: "Sehr lecker", pinyin: "zer le-ker" },
    { category: "transport", ru: "Где метро?", cn: "Wo ist die U-Bahn?", pinyin: "vo ist dee u-ban" },
    { category: "shopping", ru: "Сколько стоит?", cn: "Wie viel kostet das?", pinyin: "vee fil kos-tet das" },
    { category: "emergency", ru: "Помогите!", cn: "Hilfe!", pinyin: "hil-fe" },
  ],
};

// POST /api/phrases/generate — авто-генерация фраз по языку
// Body: { tripId, language, cityName? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId, language, cityName } = body;

  if (!tripId || !language) {
    return NextResponse.json({ error: "tripId, language required" }, { status: 400 });
  }

  const phrases = PHRASES_BY_LANGUAGE[language] || PHRASES_BY_LANGUAGE.en;

  // Проверяем не созданы ли уже фразы для этой поездки
  const existing = await db.phrase.count({ where: { tripId } });
  if (existing > 0) {
    return NextResponse.json({ created: 0, message: "Фразы уже существуют", total: existing });
  }

  // Создаём фразы
  const created = await Promise.all(
    phrases.map((p, i) =>
      db.phrase.create({
        data: {
          tripId,
          category: p.category,
          ru: p.ru,
          cn: p.cn,
          pinyin: p.pinyin,
          order: i,
        },
      })
    )
  );

  return NextResponse.json({
    created: created.length,
    language,
    cityName: cityName || "",
    message: `Создано ${created.length} фраз (${language})`,
  });
}
