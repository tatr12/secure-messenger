import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arrayBufferToBase64,
  createKeyEnvelopeV2,
  decryptKeyEnvelope,
  fetchKeyEnvelope,
  KEY_ENVELOPE_V2_ITERATIONS,
  unlockKeyEnvelope,
  updateKeyEnvelope,
} from './crypto.js';

function mockFetch(t, implementation) {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = implementation;
}

async function createLegacyEnvelope(privateKeyPkcs8, password, username) {
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const wrappingKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(`${username}_key_enc`),
      iterations: 10_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    privateKeyPkcs8
  );

  return {
    version: 1,
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

test('key envelope is requested with the active bearer token', async (t) => {
  let request;
  mockFetch(t, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { key_envelope: { version: 2 } };
      },
    };
  });

  const response = await fetchKeyEnvelope('session-token');

  assert.equal(request.url, '/me/key-envelope');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers.Authorization, 'Bearer session-token');
  assert.equal(response.key_envelope.version, 2);
});

test('key envelope cannot be requested without a session token', async () => {
  await assert.rejects(fetchKeyEnvelope(''), /Отсутствует токен сессии/);
});

test('key envelope migration is authenticated and sends the account password', async (t) => {
  let request;
  const keyEnvelope = { version: 2 };
  mockFetch(t, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { status: 'migrated', version: 2 };
      },
    };
  });

  await updateKeyEnvelope('session-token', 'account-password', keyEnvelope);

  assert.equal(request.url, '/me/key-envelope');
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers.Authorization, 'Bearer session-token');
  assert.deepEqual(JSON.parse(request.options.body), {
    password: 'account-password',
    key_envelope: keyEnvelope,
  });
});

test('v2 uses a random salt and rejects a wrong password', async () => {
  const privateKeyBytes = new TextEncoder().encode('private-key-test-material');
  const firstEnvelope = await createKeyEnvelopeV2(
    privateKeyBytes.buffer,
    'correct-password'
  );
  const secondEnvelope = await createKeyEnvelopeV2(
    privateKeyBytes.buffer,
    'correct-password'
  );

  assert.equal(firstEnvelope.version, 2);
  assert.equal(firstEnvelope.kdf.iterations, KEY_ENVELOPE_V2_ITERATIONS);
  assert.notEqual(firstEnvelope.kdf.salt, secondEnvelope.kdf.salt);
  assert.notEqual(firstEnvelope.cipher.iv, secondEnvelope.cipher.iv);

  const decrypted = await decryptKeyEnvelope(
    firstEnvelope,
    'correct-password',
    'alice'
  );
  assert.deepEqual(new Uint8Array(decrypted), privateKeyBytes);

  await assert.rejects(
    decryptKeyEnvelope(firstEnvelope, 'wrong-password', 'alice')
  );
});

test('legacy envelope unlocks, verifies its public key and upgrades to v2', async () => {
  const generatedKeys = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits', 'deriveKey']
  );
  const publicKey = await globalThis.crypto.subtle.exportKey(
    'jwk',
    generatedKeys.publicKey
  );
  const privateKeyPkcs8 = await globalThis.crypto.subtle.exportKey(
    'pkcs8',
    generatedKeys.privateKey
  );
  const legacyEnvelope = await createLegacyEnvelope(
    privateKeyPkcs8,
    'legacy-password',
    'alice'
  );

  const { privateKey, migratedEnvelope } = await unlockKeyEnvelope({
    keyEnvelope: legacyEnvelope,
    password: 'legacy-password',
    username: 'alice',
    publicKey,
  });

  assert.equal(privateKey.extractable, false);
  assert.equal(migratedEnvelope.version, 2);

  const partnerKeys = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits', 'deriveKey']
  );
  const oldMessageKey = await globalThis.crypto.subtle.deriveKey(
    { name: 'ECDH', public: partnerKeys.publicKey },
    generatedKeys.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const restoredMessageKey = await globalThis.crypto.subtle.deriveKey(
    { name: 'ECDH', public: partnerKeys.publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const messageIv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const oldCiphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: messageIv },
    oldMessageKey,
    new TextEncoder().encode('old message')
  );
  const restoredMessage = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: messageIv },
    restoredMessageKey,
    oldCiphertext
  );
  assert.equal(new TextDecoder().decode(restoredMessage), 'old message');

  const migratedPrivateKey = await decryptKeyEnvelope(
    migratedEnvelope,
    'legacy-password',
    'alice'
  );
  assert.deepEqual(new Uint8Array(migratedPrivateKey), new Uint8Array(privateKeyPkcs8));
});
