import assert from 'node:assert/strict';
import test from 'node:test';

import {
  indexChatPreferences,
  listChatPreferences,
  updateChatPreference,
} from './chatPreferencesApi.js';

test('chat preferences list uses the active bearer token', async () => {
  let request;
  const preferences = await listChatPreferences(
    'access-token',
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return [{
            partner: 'bob',
            is_pinned: true,
            is_muted: false,
            is_archived: false,
            updated_at: '2026-07-31T12:00:00Z',
          }];
        },
      };
    },
  );

  assert.equal(request.url, '/chat-preferences');
  assert.equal(request.options.headers.Authorization, 'Bearer access-token');
  assert.equal(preferences[0].partner, 'bob');
  assert.equal(preferences[0].pinned, true);
});

test('chat preference update maps UI fields to the server contract', async () => {
  let request;
  const preference = await updateChatPreference(
    'access-token',
    'bob smith',
    { muted: true, archived: false },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            partner: 'bob smith',
            is_pinned: false,
            is_muted: true,
            is_archived: false,
            updated_at: null,
          };
        },
      };
    },
  );

  assert.equal(request.url, '/chat-preferences/bob%20smith');
  assert.equal(request.options.method, 'PATCH');
  assert.deepEqual(JSON.parse(request.options.body), {
    is_muted: true,
    is_archived: false,
  });
  assert.equal(preference.muted, true);
});

test('chat preferences are indexed by partner without session data', () => {
  const indexed = indexChatPreferences([{
    partner: 'bob',
    is_pinned: false,
    is_muted: true,
    is_archived: true,
  }]);

  assert.deepEqual(indexed.bob, {
    partner: 'bob',
    pinned: false,
    muted: true,
    archived: true,
    updatedAt: null,
  });
});
