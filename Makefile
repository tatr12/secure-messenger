COMPOSE_DEV=docker compose --env-file .env -f infra/compose/docker-compose.dev.yml
COMPOSE_PROD=docker compose --env-file .env -f infra/compose/docker-compose.prod.yml

up:
	$(COMPOSE_DEV) up -d --build

down:
	$(COMPOSE_DEV) down

ps:
	$(COMPOSE_DEV) ps

logs:
	$(COMPOSE_DEV) logs -f

backend-logs:
	$(COMPOSE_DEV) logs -f backend

prod-up:
	$(COMPOSE_PROD) up -d --build

prod-down:
	$(COMPOSE_PROD) down

prod-ps:
	$(COMPOSE_PROD) ps

lint:
	ruff check .

format:
	ruff format .
	black .

test:
	pytest

check:
	ruff check .
	black --check .
	pytest
