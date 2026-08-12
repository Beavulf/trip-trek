# ============================================
# TripTrek — Docker Deployment Guide
# ============================================

## Что это

Production-сборка TripTrek в Docker контейнере:
- Next.js 16 (production build, Turbopack)
- WebSocket сервер (socket.io) — real-time обновления
- Web Push (VAPID) — уведомления на заблокированный телефон
- Service Worker — PWA, offline кэш
- Prisma + SQLite — база данных
- Health check — автопроверка каждые 30с

---

## Быстрый старт (5 шагов)

```bash
# 1. Перейди в папку docker-deploy
cd docker-deploy

# 2. Создай .env из примера
cp .env.example .env

# 3. Отредактируй .env — поменяй секреты!
nano .env

# 4. Собери и запусти
docker-compose up -d --build

# 5. Проверь что работает
curl http://localhost:3000/api/health
```

Открой http://localhost:3000 в браузере.

---

## Требования

- Docker 20+
- Docker Compose 2+ (или `docker compose`)
- 512MB RAM минимум (рекомендуется 1GB)
- 1GB свободного места

---

## Настройка .env

ОБЯЗАТЕЛЬНО поменяй перед запуском:

### NEXTAUTH_SECRET
Секретный ключ для JWT токенов.
```bash
openssl rand -base64 32
```

### NEXTAUTH_URL
URL приложения (куки / редиректы):
- Локально: `http://localhost:3000`
- С телефона в той же Wi‑Fi: можно оставить localhost; открывай `http://<LAN-IP>:3000`

### VAPID ключи (для push-уведомлений)
```bash
npx web-push generate-vapid-keys
```
Скопируй public и private ключи в .env

---

## Команды

| Действие | Команда |
|----------|---------|
| Запустить | `docker-compose up -d --build` |
| Остановить | `docker-compose down` |
| Логи | `docker-compose logs -f` |
| Перезапустить | `docker-compose restart` |
| Пересобрать | `docker-compose up -d --build --force-recreate` |
| Статус | `docker-compose ps` |
| Зайти в контейнер | `docker-compose exec triptrek sh` |

---

## Данные (volumes)

База данных и загруженные фото хранятся в Docker volumes:

| Volume | Путь в контейнере | Что хранит |
|--------|-------------------|------------|
| `triptrek-db` | `/app/data/triptrek.db` | SQLite база данных |
| `triptrek-uploads` | `/app/public/uploads/` | Фото пользователей, аватары |

- `docker-compose down` — данные сохраняются
- `docker-compose down -v` — данные УДАЛЯЮТСЯ

### Бэкап

```bash
# Бэкап БД
docker cp triptrek-app:/app/data/triptrek.db ./backup-$(date +%Y%m%d).db

# Бэкап фото
docker cp triptrek-app:/app/public/uploads ./uploads-backup
```

### Восстановление

```bash
docker cp ./backup.db triptrek-app:/app/data/triptrek.db
docker-compose restart
```

---

## Структура

```
docker-deploy/
├── docker-compose.yml   — оркестрация
├── Dockerfile            — сборка образа (3 этапа)
├── .dockerignore         — исключения
├── .env.example          — шаблон настроек
├── start.sh              — скрипт быстрого запуска
└── README.md             — этот файл
```

---

## Что включено

✅ Next.js 16 production build (Turbopack)
✅ Custom server.ts (Next.js + socket.io на одном порту)
✅ WebSocket (socket.io) — real-time обновления между участниками
✅ Web Push (VAPID) — уведомления на заблокированный телефон
✅ Service Worker — PWA, offline кэш, push
✅ Prisma + SQLite — база данных в volume (сохраняется)
✅ Health check — автопроверка каждые 30с
✅ Auto-restart — контейнер перезапускается при падении
✅ Многоэтапная сборка — минимальный размер образа

---

## Reverse Proxy (HTTPS)

### Caddy (авто-HTTPS, рекомендуется)

Создай Caddyfile:
```
triptrek.example.com {
    reverse_proxy localhost:3000
}
```

Запусти Caddy — он автоматически получит SSL сертификат.

### Nginx

```nginx
server {
    listen 80;
    server_name triptrek.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Важно:** `proxy_set_header Upgrade` и `Connection "upgrade"` обязательны для WebSocket!

После настройки HTTPS, поменяй в .env:
```
NEXTAUTH_URL=https://triptrek.example.com
```

---

## Обновление

```bash
# 1. Скопируй новые файлы проекта на сервер
# 2. Пересобери контейнер
cd docker-deploy
docker-compose up -d --build

# 3. Примени миграции БД если есть
docker-compose exec triptrek bunx prisma db push
```

---

## Первый запуск — создание аккаунтов

После запуска открой http://localhost:3000 → нажми "Регистрация":
1. Введи имя, email, пароль
2. Выбери эмодзи и цвет
3. Готово!

Для создания поездки → нажми на переключатель поездок (🌏) → "Создать из шаблона" или "Создать с нуля".

---

## Troubleshooting

### Контейнер не запускается
```bash
docker-compose logs triptrek
```

### Prisma ошибка
```bash
docker-compose exec triptrek bunx prisma generate
docker-compose exec triptrek bunx prisma db push
docker-compose restart
```

### Порт занят
```bash
# Смени порт в docker-compose.yml
ports:
  - "8080:3000"  # вместо 3000:3000
```
