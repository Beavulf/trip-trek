#!/bin/bash
# TripTrek — quick Docker start
set -e
cd "$(dirname "$0")"

echo "TripTrek Docker Setup"
echo ""

if [ ! -f .env ]; then
  echo "Creating .env from .env.example…"
  cp .env.example .env
  # Секрета-фолбэка больше нет: предсказуемый change-this-secret-<ts> проходил
  # прод-гард entrypoint и становился ключом всех сессий (аудит 2026-09-12)
  if ! command -v openssl >/dev/null 2>&1; then
    echo "FATAL: openssl required to generate NEXTAUTH_SECRET (openssl rand -base64 32)"
    exit 1
  fi
  SECRET=$(openssl rand -base64 32)
  if command -v sed >/dev/null 2>&1; then
    sed -i.bak "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$SECRET|g" .env && rm -f .env.bak
  else
    echo "FATAL: sed required to write NEXTAUTH_SECRET into .env"
    exit 1
  fi
  echo "Created .env (NEXTAUTH_URL=http://localhost:3000)"
  echo ""
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed: https://docs.docker.com/get-docker/"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose is not installed"
  exit 1
fi

echo "Building and starting…"
$COMPOSE up -d --build

echo ""
echo "Waiting for health (up to ~90s)…"
ok=0
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 3
done

if [ "$ok" = 1 ]; then
  echo "TripTrek is up: http://localhost:3000"
  echo "Phone (same Wi‑Fi): http://<LAN-IP>:3000"
  echo "Logs: $COMPOSE logs -f"
else
  echo "Still starting — check: curl http://localhost:3000/api/health"
  echo "Logs: $COMPOSE logs -f"
fi
