import { createKeyEnvelopeV2 } from '../src/crypto.js';

const USERS = [
  ['voiden_alice', 'Alice123456!'],
  ['voiden_bob', 'Bob123456!'],
  ['voiden_charlie', 'Charlie123456!'],
  ['voiden_diana', 'Diana123456!'],
  ['voiden_admin', 'Admin123456!'],
  ['voiden_test', 'Test123456!'],
];

async function createUser(username, password) {
  const generatedKeys = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits', 'deriveKey']
  );

  const publicKeyJwk = await crypto.subtle.exportKey(
    'jwk',
    generatedKeys.publicKey
  );

  const privateKeyPkcs8 = await crypto.subtle.exportKey(
    'pkcs8',
    generatedKeys.privateKey
  );

  const keyEnvelope = await createKeyEnvelopeV2(
    privateKeyPkcs8,
    password
  );

  const response = await fetch(
    'http://127.0.0.1:8000/register',
    {
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
        public_key: publicKeyJwk,
        key_envelope: keyEnvelope,
      }),
    }
  );

  console.log(
    username,
    response.status,
    await response.text()
  );
}

for (const [username, password] of USERS) {
  await createUser(username, password);
}
