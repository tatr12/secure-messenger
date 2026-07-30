import assert from 'node:assert/strict';
import test from 'node:test';

import { updateProfile } from './profileApi.js';

test('profile update uses the active bearer token and expected payload', async () => {
  let request;
  const data = await updateProfile(
    'access-token',
    { displayName: 'Alice', bio: 'Secure by default' },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { display_name: 'Alice', bio: 'Secure by default' };
        },
      };
    },
  );

  assert.equal(request.url, '/user/update');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer access-token');
  assert.deepEqual(JSON.parse(request.options.body), {
    display_name: 'Alice',
    bio: 'Secure by default',
  });
  assert.equal(data.display_name, 'Alice');
});

test('profile update rejects a missing active session token', async () => {
  let fetchCalled = false;

  await assert.rejects(
    updateProfile('', { displayName: 'Alice', bio: '' }, async () => {
      fetchCalled = true;
    }),
    (error) => error.status === 401,
  );

  assert.equal(fetchCalled, false);
});
