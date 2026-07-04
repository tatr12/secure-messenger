#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/../.."

echo "🚀 Secure Messenger startup"

echo "1) Checking Docker..."
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running."
  echo "👉 Start Docker Desktop, then run this script again."
  exit 1
fi

echo "✅ Docker is running"

echo "2) Starting infrastructure..."
docker compose \
  --env-file .env \
  -f infra/compose/docker-compose.prod.yml \
  -f infra/compose/docker-compose.monitoring.yml \
  up -d

echo "3) Containers:"
docker compose \
  --env-file .env \
  -f infra/compose/docker-compose.prod.yml \
  -f infra/compose/docker-compose.monitoring.yml \
  ps

echo "4) Checking backend health..."
sleep 3

if curl -fsS http://localhost/health >/dev/null; then
  echo "✅ Backend health: OK"
else
  echo "❌ Backend health: FAILED"
  exit 1
fi

echo ""
echo "✅ Ready!"
echo "Backend:    http://localhost/health"
echo "Metrics:    http://localhost/metrics"
echo "Grafana:    http://localhost:3000"
echo "Prometheus: http://localhost:9090"
