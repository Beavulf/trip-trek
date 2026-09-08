import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
try {
  await prisma.trip.create({
    data: {
      id: "trip-test-1",
      title: "Тестовая поездка",
      destination: "Токио",
      startDate: new Date("2026-09-10T00:00:00.000Z"),
      totalDays: 5,
      currency: "USD",
      coverColor: "#f97316",
      coverEmoji: "🌏",
      status: "active",
      inviteCode: "test123",
    }
  });
  await prisma.tripMember.create({
    data: { id: "tm-test-1", userId: "demo-user-1", tripId: "trip-test-1", displayName: "You", color: "#3b82f6", emoji: "👤", role: "owner" }
  });
  await prisma.day.create({
    data: { id: "day-test-1", dayNumber: 1, city: "Токио", date: new Date("2026-09-10T00:00:00.000Z"), cityKey: "tokyo", title: "День 1", tripId: "trip-test-1" }
  });
  await prisma.photo.create({
    data: {
      id: "photo-test-1",
      url: "/uploads/test-photo.jpg", width: 1920, height: 1080,
      caption: "Тестовое фото", lat: 35.6762, lng: 139.6503, address: "Токио, Япония",
      tripId: "trip-test-1", dayId: "day-test-1", userId: "demo-user-1",
      takenAt: new Date("2026-03-15T10:00:00.000Z")
    }
  });
  console.log("TRIP + MEMBER + DAY + PHOTO CREATED");
} catch (e) {
  console.error("ERR:", e instanceof Error ? e.message : String(e));
} finally {
  await prisma.\$disconnect();
}
