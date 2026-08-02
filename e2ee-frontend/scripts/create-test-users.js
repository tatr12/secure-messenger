/* eslint-env node */

import { createKeyEnvelopeV2 } from '../src/crypto.js';

const API_URL = process.env.VOIDEN_API_URL || 'http://127.0.0.1:8000';

const USERS = [
  ['voiden_alice', 'Alice123456!'],
  ['voiden_bob', 'Bob123456!'],
  ['voiden_charlie', 'Charlie123456!'],
  ['voiden_diana', 'Diana123456!'],
  ['voiden_admin', 'Admin123456!'],
  ['voiden_test', 'Test123456!'],
];

const results = {
  created: 0,
  skipped: 0,
  failed: 0,
};

async function createUser(username, password) {
  const generatedKeys = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits', 'deriveKey']
  );

  const publicKey = await crypto.subtle.exportKey(
    'jwk',
    generatedKeys.publicKey
  );

  const privateKey = await crypto.subtle.exportKey(
    'pkcs8',
    generatedKeys.privateKey
  );

  const keyEnvelope = await createKeyEnvelopeV2(
    privateKey,
    password
  );

  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      display_name: username,
      email: `${username}@example.com`,
      password,
      bio: 'VØIDEN DEV TEST',
      public_key: publicKey,
      key_envelope: keyEnvelope,
    }),
  });

  const responseText = await response.text();

  if (response.status === 201) {
    results.created += 1;
    console.log(`CREATED  ${username}`);
    return;
  }

  if (
    response.status === 400 &&
    responseText.includes('Username already taken')
  ) {
    results.skipped += 1;
    console.log(`SKIPPED  ${username} — already exists`);
    return;
  }

  results.failed += 1;
  console.error(
    `FAILED   ${username} — HTTP ${response.status}: ${responseText}`
  );
}

for (const [username, password] of USERS) {
  try {
    await createUser(username, password);
  } catch (error) {
    results.failed += 1;
    console.error(`FAILED   ${username} — ${error.message}`);
  }
}

console.log('');
console.log('VØIDEN test-user seeding completed');
console.log(`Created: ${results.created}`);
console.log(`Skipped: ${results.skipped}`);
console.log(`Failed:  ${results.failed}`);
console.log('');
console.log('Mailpit: http://127.0.0.1:8026');

if (results.failed > 0) {
  process.exitCode = 1;
}
