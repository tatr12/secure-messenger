import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSessionRefreshDelay,
  refreshSession,
  revokeSession,
  SessionApiError,
} from './sessionApi.js';

test('session refresh uses only the HttpOnly cookie transport', async () => {
  let request;
  const data = await refreshSession(async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { access_token: 'new-access', expires_in: 900 };
      },
    };
  });

  assert.equal(data.access_token, 'new-access');
  assert.equal(request.url, '/session/refresh');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers, undefined);
  assert.equal(request.options.cache, 'no-store');
});

test('session refresh reports an authorization failure', async () => {
  await assert.rejects(
    refreshSession(async () => ({ ok: false, status: 401 })),
    (error) => error instanceof SessionApiError && error.status === 401,
  );
});

test('logout revokes the cookie session and sends the current access token', async () => {
  let request;
  await revokeSession('current-access', async (url, options) => {
    request = { url, options };
    return { ok: true, status: 204 };
  });

  assert.equal(request.url, '/session/logout');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.keepalive, true);
  assert.equal(request.options.headers.Authorization, 'Bearer current-access');
});

test('refresh is scheduled one minute before access token expiry', () => {
  assert.equal(getSessionRefreshDelay(900), 840_000);
  assert.equal(getSessionRefreshDelay(30), 1_000);
  assert.equal(getSessionRefreshDelay(undefined), 60_000);
});
