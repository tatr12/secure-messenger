PYTHON=.venv/bin/python
RUFF=.venv/bin/ruff
BLACK=.venv/bin/black
PYTEST=PYTHONPATH=. .venv/bin/pytest

COMPOSE=docker compose \
	--env-file .env \
	-f infra/compose/docker-compose.prod.yml \
	-f infra/compose/docker-compose.monitoring.yml

MESSAGE ?= migration

# ==========================
# Development
# ==========================

start:
	./infra/scripts/start-dev.sh

stop:
	$(COMPOSE) down

restart:
	$(MAKE) stop
	$(MAKE) start

status:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

backend-logs:
	$(COMPOSE) logs -f backend

postgres-logs:
	$(COMPOSE) logs -f postgres

nginx-logs:
	$(COMPOSE) logs -f nginx

# ==========================
# Monitoring
# ==========================

health:
	curl http://localhost/health

metrics:
	curl http://localhost/metrics | head -30

grafana:
	open http://localhost:3000

prometheus:
	open http://localhost:9090

# ==========================
# Quality
# ==========================

lint:
	$(RUFF) check .

format:
	$(RUFF) format .
	$(BLACK) .

test:
	$(PYTEST)

check:
	$(RUFF) check .
	$(BLACK) --check .
	$(PYTEST)

# ==========================
# Database (Alembic)
# ==========================

migration:
	alembic revision --autogenerate -m "$(MESSAGE)"

migrate:
	alembic upgrade head

downgrade:
	alembic downgrade -1

history:
	alembic history

current:
	alembic current
