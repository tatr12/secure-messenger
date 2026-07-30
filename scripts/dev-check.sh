#!/usr/bin/env bash

set -u

COMPOSE_FILES=(
  "-f" "infra/compose/docker-compose.prod.yml"
  "-f" "infra/compose/docker-compose.monitoring.yml"
  "-f" "infra/compose/docker-compose.devtools.yml"
)

PASS=0
FAIL=0

green="\033[0;32m"
red="\033[0;31m"
yellow="\033[0;33m"
reset="\033[0m"

ok() {
  printf "${green}✅ %-22s OK${reset}\n" "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf "${red}❌ %-22s FAIL${reset}\n" "$1"
  FAIL=$((FAIL + 1))
}

warn() {
  printf "${yellow}⚠️  %-22s %s${reset}\n" "$1" "$2"
}

check_http() {
  local name="$1"
  local url="$2"

  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    ok "$name"
  else
    fail "$name"
  fi
}

echo
echo "========================================"
echo "       VØIDEN Infrastructure Check"
echo "========================================"
echo

if docker info >/dev/null 2>&1; then
  ok "Docker daemon"
else
  fail "Docker daemon"
  echo
  echo "Docker is not running. Start Docker Desktop."
  exit 1
fi

if docker compose --env-file .env "${COMPOSE_FILES[@]}" ps >/dev/null 2>&1; then
  ok "Docker Compose"
else
  fail "Docker Compose"
fi

required_containers=(
  "compose-backend-1"
  "compose-postgres-1"
  "compose-redis-1"
  "compose-nginx-1"
  "compose-prometheus-1"
  "compose-grafana-1"
)

for container in "${required_containers[@]}"; do
  if docker ps --format '{{.Names}}' | grep -qx "$container"; then
    ok "$container"
  else
    fail "$container"
  fi
done

if docker ps --format '{{.Names}}' | grep -Eq 'mailpit|messenger_mailpit'; then
  ok "Mailpit container"
else
  warn "Mailpit container" "not running"
fi

if docker exec compose-postgres-1 pg_isready -U postgres -d messenger_db >/dev/null 2>&1; then
  ok "PostgreSQL"
else
  fail "PostgreSQL"
fi

if docker exec compose-redis-1 redis-cli ping 2>/dev/null | grep -q PONG; then
  ok "Redis"
else
  fail "Redis"
fi

if curl -kfsS --max-time 5 "https://localhost/health" >/dev/null 2>&1; then
  ok "Backend health"
else
  fail "Backend health"
fi

if curl -kfsS --max-time 5 "https://localhost/" >/dev/null 2>&1; then
  ok "Nginx frontend"
else
  fail "Nginx frontend"
fi
check_http "Prometheus" "http://localhost:9090/-/healthy"
check_http "Grafana" "http://localhost:3000/api/health"
check_http "Mailpit UI" "http://localhost:8025"

if curl -fsS --max-time 3 "http://localhost:5173" >/dev/null 2>&1; then
  ok "Frontend Vite"
else
  warn "Frontend Vite" "not running"
fi

echo
echo "----------------------------------------"
printf "Passed: ${green}%s${reset}  Failed: ${red}%s${reset}\n" "$PASS" "$FAIL"
echo "----------------------------------------"

if [ "$FAIL" -eq 0 ]; then
  echo "VØIDEN infrastructure is operational."
  exit 0
fi

echo "Some infrastructure checks failed."
exit 1
