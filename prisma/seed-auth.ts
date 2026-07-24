import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

// Установка паролей для существующих участников (для тестирования auth)
const PARTICIPANT_PASSWORDS = [
  { name: "Ты", email: "you@triptrek.com", password: "1234" },
  { name: "Лёха", email: "leha@triptrek.com", password: "1234" },
  { name: "Дэн", email: "den@triptrek.com", password: "1234" },
];

async function main() {
  console.log("🔐 Setting up auth passwords...");
  for (const p of PARTICIPANT_PASSWORDS) {
    const existing = await db.participant.findFirst({ where: { name: p.name } });
    if (existing) {
      const hashed = await bcrypt.hash(p.password, 10);
      await db.participant.update({
        where: { id: existing.id },
        data: { email: p.email, password: hashed },
      });
      console.log(`✓ ${p.name}: ${p.email} / ${p.password}`);
    }
  }
  console.log("Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
