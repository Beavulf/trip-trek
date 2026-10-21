import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PublicTripView, type PublicTrip } from "@/components/public/public-trip-view";

// Публичная страница поездки для родных и друзей: /p/<shareToken>.
// Только смотреть — галерея, маршрут, карта. Деньги, чат, дневник, email и
// реквизиты НЕ отдаются принципиально (владелец делится картинкой поездки,
// а не кассой). Включает/выключает ссылку владелец из карточки «Поделиться».

export const dynamic = "force-dynamic"; // фото грузятся прямо в поездке — всегда свежие

export const metadata: Metadata = {
  title: "Поездка в TripTrek",
  robots: { index: false, follow: false }, // ссылка личная, индексировать нечего
};

export default async function PublicTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const trip = await db.trip.findFirst({
    where: { shareToken: token, shareEnabled: true },
    select: {
      title: true,
      destination: true,
      coverEmoji: true,
      coverColor: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      days: {
        orderBy: { dayNumber: "asc" },
        select: {
          dayNumber: true,
          date: true,
          city: true,
          title: true,
          places: {
            orderBy: { order: "asc" },
            select: { name: true, category: true, lat: true, lng: true, status: true },
          },
        },
      },
      photos: {
        orderBy: { takenAt: "desc" },
        take: 500,
        select: {
          url: true,
          thumbUrl: true,
          caption: true,
          takenAt: true,
          day: { select: { dayNumber: true } },
        },
      },
    },
  });

  if (!trip) notFound();

  const view: PublicTrip = {
    title: trip.title,
    destination: trip.destination,
    emoji: trip.coverEmoji,
    accent: trip.coverColor,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate?.toISOString() ?? null,
    totalDays: trip.totalDays,
    days: trip.days.map((d) => ({
      dayNumber: d.dayNumber,
      city: d.city,
      title: d.title,
      places: d.places.map((p) => ({
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        visited: p.status === "visited",
      })),
    })),
    photos: trip.photos.map((p) => ({
      url: p.url,
      thumbUrl: p.thumbUrl ?? p.url,
      caption: p.caption,
      dayNumber: p.day?.dayNumber ?? null,
    })),
  };

  return <PublicTripView trip={view} />;
}
