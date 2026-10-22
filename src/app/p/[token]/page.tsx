import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PublicTripView, type PublicTrip } from "@/components/public/public-trip-view";

// Публичная страница поездки: /p/<shareToken>. «Живой журнал»: обложка,
// лучшие кадры, главы-дни, галерея, карта. Только смотреть — деньги, чат,
// дневник и реквизиты НЕ отдаются принципиально (владелец делится картинкой
// поездки, а не кассой). Включает/выключает ссылку владелец из карточки
// «Поделиться»; там же тумблер скачивания фото гостями (shareAllowDownload).

export const dynamic = "force-dynamic"; // фото грузятся прямо в поездке — всегда свежие

// Первая партия фото летит в SSR-пейлоад: 200 — компромисс между мгновенной
// отрисовкой (главы-дни, избранные, карта уже полные у свежих поездок) и весом
// HTML на телефоне. Остальное гость докачивает порциями через /p/<token>/photos.
const FIRST_BATCH = 200;

// generateMetadata и страница зовут один запрос: cache() склеивает их в один
// вызов на реквест — иначе база дважды тянет дни и первую партию фото
const findSharedTrip = cache(async (token: string) =>
  db.trip.findFirst({
    where: { shareToken: token, shareEnabled: true },
    select: {
      title: true,
      destination: true,
      coverEmoji: true,
      coverColor: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      shareAllowDownload: true,
      shareHearts: true,
      _count: { select: { photos: true } },
      days: {
        orderBy: { dayNumber: "asc" },
        select: {
          dayNumber: true,
          date: true,
          city: true,
          title: true,
          summary: true,
          places: {
            orderBy: { order: "asc" },
            select: { name: true, category: true, lat: true, lng: true, status: true },
          },
        },
      },
      photos: {
        // Детерминированный порядок [takenAt desc, id desc] — продолжение этого
        // списка порциями из /photos идёт keyset-курсором ровно отсюда
        orderBy: [{ takenAt: "desc" }, { id: "desc" }],
        take: FIRST_BATCH,
        select: {
          id: true,
          url: true,
          thumbUrl: true,
          width: true,
          height: true,
          caption: true,
          isFavorite: true,
          lat: true,
          lng: true,
          takenAt: true,
          place: { select: { name: true } },
          day: { select: { dayNumber: true } },
        },
      },
    },
  })
);

// Превью ссылки в мессенджерах: карточка с обложкой поездки и фото.
// metadataBase из корневого layout резолвит /uploads в абсолютный URL.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const trip = await findSharedTrip(token);
  const title = trip ? `${trip.title} — TripTrek` : "Поездка в TripTrek";
  const description = trip
    ? `${trip.destination} · ${trip._count.photos} фото из путешествия — маршрут, места и кадры`
    : "Публичная страница путешествия";
  const ogImage = trip?.photos.find((p) => p.thumbUrl)?.thumbUrl ?? undefined;
  return {
    title,
    description,
    robots: { index: false, follow: false }, // ссылка личная, индексировать нечего
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function PublicTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const trip = await findSharedTrip(token);
  if (!trip) notFound();

  const view: PublicTrip = {
    title: trip.title,
    destination: trip.destination,
    emoji: trip.coverEmoji,
    accent: trip.coverColor,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate?.toISOString() ?? null,
    totalDays: trip.totalDays,
    allowDownload: trip.shareAllowDownload,
    hearts: trip.shareHearts,
    photosTotal: trip._count.photos,
    days: trip.days.map((d) => ({
      dayNumber: d.dayNumber,
      date: d.date.toISOString(),
      city: d.city,
      title: d.title,
      summary: d.summary,
      places: d.places.map((p) => ({
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        visited: p.status === "visited",
      })),
    })),
    photos: trip.photos.map((p) => ({
      id: p.id,
      url: p.url,
      thumbUrl: p.thumbUrl ?? p.url,
      width: p.width,
      height: p.height,
      caption: p.caption,
      isFavorite: p.isFavorite,
      lat: p.lat,
      lng: p.lng,
      takenAt: p.takenAt.toISOString(),
      placeName: p.place?.name ?? null,
      dayNumber: p.day?.dayNumber ?? null,
    })),
  };

  return <PublicTripView trip={view} token={token} />;
}
