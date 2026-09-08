INSERT OR REPLACE INTO Trip (id, title, destination, startDate, totalDays, currency, coverColor, coverEmoji, status, inviteCode, createdAt, updatedAt)
VALUES ('trip-test-1', 'Тестовая поездка', 'Токио', '2026-09-10', 5, 'USD', '#f97316', '🌏', 'active', 'test123', '2026-09-06T12:00:00Z', '2026-09-06T12:00:00Z');

INSERT OR REPLACE INTO TripMember (id, userId, tripId, displayName, color, emoji, role, joinedAt)
VALUES ('tm-test-1', 'demo-user-1', 'trip-test-1', 'You', '#3b82f6', '👤', 'owner', '2026-09-06T00:00:00Z');

INSERT OR REPLACE INTO Day (id, dayNumber, city, date, tripId, "order")
VALUES ('day-test-1', 1, 'Токио', '2026-09-10', 'trip-test-1', 1);

INSERT OR REPLACE INTO Photo (id, url, width, height, caption, dayId, placeId, lat, lng, address, takenAt, tripId, userId, createdAt)
VALUES ('photo-test-1', '/uploads/test-photo.jpg', 1920, 1080, 'Тестовое фото', 'day-test-1', NULL, 35.6762, 139.6503, 'Токио, Япония', '2026-03-15T10:00:00Z', 'trip-test-1', 'demo-user-1', '2026-03-15T10:00:00Z');
