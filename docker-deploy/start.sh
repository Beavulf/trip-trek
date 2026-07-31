#!/bin/bash
# ============================================
# TripTrek — Быстрый запуск Docker
# ============================================

set -e

echo "🚀 TripTrek Docker Setup"
echo ""

# Проверяем .env
if [ ! -f .env ]; then
    echo "📝 Создаю .env из примера..."
    cp .env.example .env
    
    # Генерируем NEXTAUTH_SECRET
    SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change-this-secret")
    sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$SECRET|g" .env
    
    echo "✅ .env создан с автоматически сгенерированным секретом"
    echo "⚠️  Отредактируй NEXTAUTH_URL если нужен домен!"
    echo ""
fi

# Проверяем Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    echo "   Установка: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose не установлен!"
    echo "   Установка: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "🔨 Собираю и запускаю..."
echo ""

# Определяем команду compose
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

$COMPOSE up -d --build

echo ""
echo "⏳ Жду запуска (30 секунд)..."
sleep 30

# Проверяем health
if curl -s http://localhost:3000/api/api/health | grep -q "ok\|OK\|200" 2>/dev/null || \
   curl -s http://localhost:3000/api/health | grep -q "ok\|OK\|200" 2>/dev/null; then
    echo ""
    echo "✅ TripTrek запущен и работает!"
    echo "🌐 Открой: http://localhost:3000"
    echo ""
    echo "📋 Логи: $COMPOSE logs -f"
    echo "🛑 Стоп:  $COMPOSE down"
else
    echo ""
    echo "⚠️  Сервер ещё запускается. Подожди 30 секунд и проверь:"
    echo "   curl http://localhost:3000/api/health"
    echo ""
    echo "📋 Логи: $COMPOSE logs -f"
fi
