// Перенос данных SQLite (dev) → PostgreSQL (prod), с сохранением id.
//
// Использование (DATABASE_URL указывает на ЦЕЛЕВОЙ Postgres):
//   SQLITE_PATH=prisma/db/dev.db bun prisma/migrate-data.mjs
//
// Файлы /uploads переносятся отдельно (docker cp / cp — см. docker-deploy/DEPLOY.md).
// Скрипт откажется работать, если в целевой БД уже есть пользователи
// (защита от случайного повторного прогона; FORCE=1 обходит).
import { Database } from "bun:sqlite";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH = process.env.SQLITE_PATH || "prisma/db/dev.db";
const pg = new PrismaClient();

// DATE столбцы в sqlite хранятся TEXT'ом — конвертируем в Date
const DATE_COLS = {
  User: ["planExpiry", "createdAt"],
  Trip: ["startDate", "endDate", "createdAt", "updatedAt"],
  TripMember: ["joinedAt"],
  PushSubscription: ["createdAt"],
  Day: ["date"],
  Place: ["visitedAt", "createdAt", "updatedAt"],
  Photo: ["takenAt", "createdAt"],
  Expense: ["createdAt"],
  JournalEntry: ["createdAt", "updatedAt"],
  BoardMessage: ["editedAt", "createdAt"],
  ChecklistItem: ["createdAt"],
  InfoItem: ["createdAt"],
  Phrase: ["createdAt"],
  FoodItem: ["createdAt"],
};
const BOOL_COLS = {
  Photo: ["isFavorite"],
  Expense: ["excludeSelf"],
  BoardMessage: ["pinned"],
  ChecklistItem: ["done"],
  Phrase: ["favorite"],
  FoodItem: ["tried"],
};
// Порядок важен: родители раньше детей (FK)
const ORDER = [
  "User", "Trip", "TripMember", "PushSubscription", "Day", "Place", "Photo",
  "Expense", "JournalEntry", "BoardMessage", "ChecklistItem", "InfoItem",
  "Phrase", "FoodItem", "BudgetPlan",
];

function toDate(v) {
  if (v == null) return null;
  // часть колонок — epoch-миллисекунды (INTEGER), часть — ISO-текст
  if (typeof v === "number") return new Date(v);
  let s = String(v);
  if (s.includes(" ")) s = s.replace(" ", "T");
  if (s.endsWith("+00:00")) s = s.slice(0, -6) + "Z";
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`bad date: ${v}`);
  return d;
}

async function main() {
  const existing = await pg.user.count();
  if (existing > 0 && process.env.FORCE !== "1") {
    console.error(`Целевая БД не пуста (${existing} users). FORCE=1 для повтора.`);
    process.exit(1);
  }

  const lite = new Database(SQLITE_PATH, { readonly: true });
  const counts = {};

  await pg.$transaction(async (tx) => {
    for (const table of ORDER) {
      const rows = lite.query(`SELECT * FROM "${table}"`).all();
      if (!rows.length) { counts[table] = 0; continue; }
      const dates = new Set(DATE_COLS[table] || []);
      const bools = new Set(BOOL_COLS[table] || []);
      const mapped = rows.map((r) => {
        const out = {};
        for (const [k, v] of Object.entries(r)) {
          if (dates.has(k)) out[k] = toDate(v);
          else if (bools.has(k)) out[k] = !!v;
          else out[k] = v;
        }
        return out;
      });
      await tx[table.charAt(0).toLowerCase() + table.slice(1)].createMany({ data: mapped });
      counts[table] = mapped.length;
    }
  });

  console.log("Перенесено:", JSON.stringify(counts));
  const check = await pg.trip.findFirst({ include: { _count: { select: { days: true, places: true, photos: true, expenses: true } } } });
  if (check) console.log(`Проверка: «${check.title}» days=${check._count.days} places=${check._count.places} photos=${check._count.photos} expenses=${check._count.expenses}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pg.$disconnect());
