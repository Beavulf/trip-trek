import { db } from "../src/lib/db";

// Миграция: создание дефолтной поездки + перенос участников в User/TripMember
async function main() {
  console.log("🔄 Migrating to multi-trip schema...");

  // 1. Создаём дефолтную поездку
  const trip = await db.trip.create({
    data: {
      id: "default-trip",
      title: "TripTrek: China 2024",
      destination: "China",
      startDate: new Date(),
      totalDays: 12,
      totalBudget: 1100,
      currency: "USD",
      inviteCode: "CHINA2024",
      coverColor: "#f97316",
      coverEmoji: "🌏",
      status: "active",
    },
  });
  console.log("✓ Trip created:", trip.id);

  // 2. Создаём пользователей из участников (если ещё нет)
  const participantData = [
    { name: "Ты", email: "you@triptrek.com", password: "1234", emoji: "🦊", color: "#f97316", role: "Организатор" },
    { name: "Лёха", email: "leha@triptrek.com", password: "1234", emoji: "🐻", color: "#06b6d4", role: "Фотограф" },
    { name: "Дэн", email: "den@triptrek.com", password: "1234", emoji: "🐼", color: "#8b5cf6", role: "Гурман" },
  ];

  const bcrypt = await import("bcryptjs");
  for (const p of participantData) {
    const hashed = await bcrypt.hash(p.password, 10);
    const user = await db.user.create({
      data: {
        email: p.email,
        name: p.name,
        password: hashed,
        emoji: p.emoji,
        color: p.color,
      },
    });
    await db.tripMember.create({
      data: {
        tripId: trip.id,
        userId: user.id,
        role: p.name === "Ты" ? "owner" : "member",
        displayName: p.name,
        emoji: p.emoji,
        color: p.color,
        budget: p.name === "Ты" ? 2500 : p.name === "Дэн" ? 2000 : 1500,
      },
    });
    console.log(`✓ User + Member: ${p.name}`);
  }

  console.log("Done! Default trip + 3 users + 3 members created.");
  console.log("Invite code:", trip.inviteCode);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
