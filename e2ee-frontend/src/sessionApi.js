export class SessionApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'SessionApiError';
    this.status = status;
  }
}

export function getSessionRefreshDelay(expiresInSeconds) {
  const lifetimeMs = Number(expiresInSeconds) * 1000;
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) return 60_000;
  return Math.max(1_000, lifetimeMs - 60_000);
}

export async function refreshSession(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('/session/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new SessionApiError('Не удалось обновить сессию', response.status);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new SessionApiError('Сервер не вернул access token', response.status);
  }
  return data;
}

export async function revokeSession(
  accessToken,
  fetchImpl = globalThis.fetch,
) {
  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined;
  return fetchImpl('/session/logout', {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    keepalive: true,
  });
}
