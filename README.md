# VØIDEN Secure Messenger

Web messenger with frontend E2EE, FastAPI, PostgreSQL, Redis and WebSocket delivery.

## Development

Start PostgreSQL, Redis, Mailpit and the backend:

```bash
docker compose up --build
```

Start the frontend separately:

```bash
cd e2ee-frontend
npm ci
npm run dev
```

Vite proxies HTTP API requests and `/ws` to the local backend. The browser uses
`ws://` for local HTTP development and automatically switches to `wss://` when
the page is served over HTTPS.

## Production

The production Nginx image builds and serves the React application, proxies the
FastAPI routes, and upgrades `/ws` connections. Port 80 only redirects to HTTPS.

Before starting production Compose, create a local `.env` and set
`TLS_CERT_PATH` and `TLS_KEY_PATH` to absolute host paths. Keep the private key
outside this repository and never commit `.env` or certificate material. Set
`PUBLIC_BASE_URL` and `CORS_ORIGINS` to the application's public HTTPS origin.

```bash
docker compose \
  --env-file .env \
  -f infra/compose/docker-compose.prod.yml \
  -f infra/compose/docker-compose.monitoring.yml \
  up -d --build
```

The application is then available through `https://<host>/`. Prometheus reads
backend metrics only inside the Docker network; `make metrics` can inspect them
without publishing `/metrics` through Nginx.
