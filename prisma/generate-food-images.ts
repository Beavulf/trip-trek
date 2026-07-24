import ZAI from "z-ai-web-dev-sdk";
import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";

const FOOD_PROMPTS: Record<string, string> = {
  // Гуанчжоу
  "Чашеобразная лапша (wonton noodles)": "Wonton noodles soup in a Chinese ceramic bowl, clear broth with shrimp and pork dumplings, thin egg noodles, garnished with scallions, authentic Cantonese cuisine, top-down food photography, natural lighting, restaurant setting",
  "Жареный гусь": "Cantonese roast goose, crispy golden brown skin, chopped pieces on white plate, garnished with plum sauce, professional food photography, restaurant setting, appetizing",
  "Димсамы": "Cantonese dim sum assortment on bamboo steamers, har gow shrimp dumplings, siu mai pork dumplings, char siu bao buns, traditional Chinese restaurant, top view, steam rising",
  "Манго саго": "Mango sago dessert in a small glass bowl, creamy yellow pudding with tapioca pearls, fresh mango chunks on top, Hong Kong style dessert, professional food photography",
  "Чаоаньский говяжий хот-пот": "Chaozhou beef hot pot, simmering broth in metal pot, thin slices of raw beef on plate, fresh vegetables, Chinese restaurant table, steam rising, authentic",
  "Пирожные из яичного белка": "Chinese egg white pastry desserts, small white fluffy cakes on ceramic plate, traditional Cantonese sweets, delicate presentation, food photography",
  // Шэньчжэнь
  "Сычуаньский хот-пот": "Sichuan hot pot with bright red spicy broth, bubbling chili oil, raw meat and vegetables on side plates, Chinese restaurant, dramatic steam, authentic Sichuan cuisine",
  "Спешелти кофе": "Specialty coffee latte in white ceramic cup with latte art, modern minimalist cafe interior, % Arabica style, professional photography, warm lighting",
  "Морепродукты": "Fresh seafood platter, grilled shrimp, steamed crab, fish on ice, Chinese seafood restaurant, professional food photography, ocean side setting",
  // Гонконг
  "Димсамы в Гонконге": "Hong Kong dim sum in bamboo steamers, shrimp har gow, pork siu mai, egg tarts, on round restaurant table, traditional tea house, top view, authentic",
  "Жареный рис с морепродуктами": "Chinese seafood fried rice on white plate, shrimp, scallops, egg, scallions, wok hei char marks, restaurant quality, professional food photography",
  "Коктейли в Ozone": "Luxury cocktail bar at 118th floor, night city view through floor to ceiling windows, elegant cocktails on bar counter, sophisticated atmosphere, Ozone bar Hong Kong",
  "Уличная еда на Temple Street": "Temple Street night market food stalls, skewers of grilled meat and seafood, steam and smoke, vibrant night market atmosphere, Hong Kong street food",
  // Макао
  "Португальские яичные тарты": "Portuguese egg tarts (pastéis de nata), golden custard tarts with caramelized tops, on ceramic plate, Macau bakery, close up food photography, flaky pastry",
  "Африканская курица": "Macanese African chicken, roasted chicken with spicy coconut sauce, on white plate with rice, Portuguese-Macanese fusion cuisine, restaurant setting",
  "Свинина на косточке": "Cha siu bao Chinese BBQ pork buns, fluffy white steamed buns opened showing red pork filling, bamboo steamer, traditional Cantonese, food photography",
};

async function main() {
  console.log("🎨 Generating food images...");
  const zai = await ZAI.create();
  const outputDir = path.join(process.cwd(), "public", "uploads", "foods");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const foods = await db.foodItem.findMany();

  for (const food of foods) {
    const prompt = FOOD_PROMPTS[food.name];
    if (!prompt) {
      console.log(`⚠ No prompt for: ${food.name}`);
      continue;
    }

    const fileName = `${food.id}.png`;
    const filePath = path.join(outputDir, fileName);
    const url = `/uploads/foods/${fileName}`;

    // Пропускаем если уже есть
    if (fs.existsSync(filePath)) {
      console.log(`⏭ Already exists: ${food.name}`);
      await db.foodItem.update({ where: { id: food.id }, data: { imageUrl: url } });
      continue;
    }

    try {
      console.log(`🎨 Generating: ${food.name}...`);
      const response = await zai.images.generations.create({
        prompt: prompt,
        size: "1024x1024",
      });
      const base64 = response.data[0].base64;
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
      await db.foodItem.update({ where: { id: food.id }, data: { imageUrl: url } });
      console.log(`✓ ${food.name} → ${url}`);
      // Пауза чтобы не перегружать
      await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error(`✗ ${food.name}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log("Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
