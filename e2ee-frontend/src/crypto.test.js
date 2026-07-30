import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchKeyEnvelope } from './crypto.js';

test('key envelope is requested with the active bearer token', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { encrypted_private_key: 'ciphertext', private_key_iv: 'iv' };
      },
    };
  };

  const envelope = await fetchKeyEnvelope('session-token');

  assert.equal(request.url, '/me/key-envelope');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers.Authorization, 'Bearer session-token');
  assert.equal(envelope.encrypted_private_key, 'ciphertext');
});

test('key envelope cannot be requested without a session token', async () => {
  await assert.rejects(fetchKeyEnvelope(''), /Отсутствует токен сессии/);
});
