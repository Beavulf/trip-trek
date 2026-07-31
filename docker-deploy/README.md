# ============================================
# TripTrek — Docker Deployment Guide
# ============================================

## Быстрый старт (3 команды)

```bash
# 1. Скопируй пример настроек и отредактируй
cp .env.example .env
# (поменяй NEXTAUTH_SECRET и NEXTAUTH_URL на свои!)

# 2. Собери и запусти
docker-compose up -d --build

# 3. Проверь что работает
curl http://localhost:3000/api/health
```

Готово! Открой http://localhost:3000 в браузере.

---

## Требования

- Docker 20+
- Docker Compose 2+
- 512MB RAM минимум (рекомендуется 1GB)

---

## Настройка перед запуском

### 1. Сгенерируй секреты

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# VAPID ключи (для push-уведомлений)
npx web-push generate-vapid-keys
```

### 2. Отредактируй .env

```bash
cp .env.example .env
nano .env
```

Обязательно поменяй:
- `NEXTAUTH_SECRET` — твой сгенерированный секрет
- `NEXTAUTH_URL` — твой домен (например `https://triptrek.example.com`)
- `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY` — сгенерированные ключи

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

---

## Данные

База данных SQLite и загруженные фото хранятся в Docker volumes:
- `triptrek-db` → `/app/data/triptrek.db`
- `triptrek-uploads` → `/app/public/uploads/`

При `docker-compose down` данные сохраняются.
При `docker-compose down -v` данные УДАЛЯЮТСЯ.

### Бэкап

```bash
# Создать бэкап БД
docker-compose exec triptrek cp /app/data/triptrek.db /app/data/backup-$(date +%Y%m%d).db

# Скопировать на хост
docker cp triptrek-app:/app/data/triptrek.db ./backup.db
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
├── Dockerfile           — сборка образа
├── .dockerignore        — исключения
├── .env.example         — шаблон настроек
└── README.md            — этот файл
```

---

## Что включено

✅ Next.js 16 (production build)
✅ WebSocket сервер (socket.io) — real-time обновления
✅ Web Push (VAPID) — уведомления на заблокированный телефон
✅ Service Worker — PWA, offline кэш, push
✅ Prisma + SQLite — база данных
✅ Health check — автопроверка каждые 30с
✅ Auto-restart — при падении контейнер перезапускается

---

## Reverse Proxy (для HTTPS)

### Caddy (рекомендуется, авто-HTTPS)

```Caddyfile
triptrek.example.com {
    reverse_proxy localhost:3000
}
```

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
    }
}
```

**Важно:** `proxy_set_header Upgrade` и `Connection "upgrade"` нужны для WebSocket!

---

## Обновление

```bash
# 1. Скопируй новые файлы проекта
# 2. Пересобери
docker-compose up -d --build

# 3. Примени миграции БД если есть
docker-compose exec triptrek bunx prisma db push
```

---

## Тестовые аккаунты

После первого запуска создай аккаунты через регистрацию:
- Email: любой
- Пароль: любой (мин 4 символа)

Или используй демо-аккаунты (если DB засеяна):
- you@triptrek.com / 1234
- leha@triptrek.com / 1234
- den@triptrek.com / 1234
