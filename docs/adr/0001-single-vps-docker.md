# ADR-0001: Один VPS + Docker Compose

Статус: принято · 2026-09-09

## Контекст
Целевая нагрузка — до ~500 активных пользователей; custom server с socket.io исключает serverless (Vercel). Платформы (Railway/Fly) дороже и менее прозрачны для файлов и WS.

## Решение
Один VPS + Docker Compose: сервисы `app` (Next + socket.io), `db` (Postgres), `caddy` (TLS). Один инстанс. Швы под будущий масштаб проектируются сразу (rate-limit store, WS transport-adapter), но Redis не поднимается, пока инстанс один.

## Последствия
- Провайдер (Hetzner, если оплатится; иначе РФ/РБ) — не влияет на код: всё через env.
- Второй инстанс потребует: Redis (WS-adapter + rate-limit store) и внешний load balancer — решения уже имеют шов.
- Отвергнуто: serverless (несовместимо с custom server/WS), платформы (цена/прозрачность).
