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

## Sessions

VØIDEN keeps the short-lived access token only in frontend memory. A rotating
refresh token is stored in an `HttpOnly`, `SameSite=Strict` cookie; production
cookies are also `Secure`. PostgreSQL stores only an HMAC hash of that token.

Logging out or switching accounts revokes the current server session, closes
its WebSocket and clears the in-memory E2EE key. The account menu can list real
active sessions and revoke another device without storing multiple accounts or
tokens in the browser.

The Alembic chain now supports a clean database through the `auth_sessions`
migration. Existing installations continue to create missing tables during
application startup for compatibility; adopting Alembic state for an existing
database should be planned separately and must not be done by blindly running
or stamping migrations against production data.
