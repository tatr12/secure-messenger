import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWebSocketProtocols,
  buildWebSocketUrl,
} from './websocketUrl.js';

test('HTTPS pages use same-origin secure WebSocket URLs', () => {
  const url = buildWebSocketUrl({
    protocol: 'https:',
    host: 'voiden.example',
  });

  assert.equal(url, 'wss://voiden.example/ws');
});

test('local HTTP development uses same-origin WebSocket proxy', () => {
  const url = buildWebSocketUrl({
    protocol: 'http:',
    host: '127.0.0.1:5173',
  });

  assert.equal(url, 'ws://127.0.0.1:5173/ws');
});

test('session token is carried by a WebSocket subprotocol, not the URL', () => {
  assert.deepEqual(buildWebSocketProtocols('session-token'), [
    'voiden',
    'voiden.auth.session-token',
  ]);
  assert.throws(() => buildWebSocketProtocols(''), /Отсутствует токен сессии/);
});
