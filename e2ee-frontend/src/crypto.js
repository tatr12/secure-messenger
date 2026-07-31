export const KEY_ENVELOPE_V2_ITERATIONS = 600_000;

const KEY_ENVELOPE_V2_MAX_ITERATIONS = 2_000_000;
const KEY_ENVELOPE_V2_SALT_BYTES = 16;
const AES_GCM_IV_BYTES = 12;
const KEY_ENVELOPE_V2_AAD = new TextEncoder().encode('VØIDEN:key-envelope:v2');

function getWebCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API недоступен');
  }
  return globalThis.crypto;
}

export const arrayBufferToBase64 = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

export const base64ToArrayBuffer = (base64) => {
  if (!base64) throw new Error('Передан пустой Base64');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
};

async function deriveWrappingKey(password, salt, iterations, usages) {
  const webCrypto = getWebCrypto();
  const baseKey = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function createKeyEnvelopeV2(privateKeyPkcs8, password) {
  const webCrypto = getWebCrypto();
  const salt = webCrypto.getRandomValues(
    new Uint8Array(KEY_ENVELOPE_V2_SALT_BYTES)
  );
  const iv = webCrypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const wrappingKey = await deriveWrappingKey(
    password,
    salt,
    KEY_ENVELOPE_V2_ITERATIONS,
    ['encrypt']
  );
  const ciphertext = await webCrypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: KEY_ENVELOPE_V2_AAD,
      tagLength: 128,
    },
    wrappingKey,
    privateKeyPkcs8
  );

  return {
    version: 2,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: KEY_ENVELOPE_V2_ITERATIONS,
      salt: arrayBufferToBase64(salt.buffer),
    },
    cipher: {
      name: 'AES-GCM',
      iv: arrayBufferToBase64(iv.buffer),
      ciphertext: arrayBufferToBase64(ciphertext),
    },
  };
}

export async function decryptKeyEnvelope(keyEnvelope, password, username) {
  const webCrypto = getWebCrypto();

  if (keyEnvelope?.version === 1) {
    if (!username) throw new Error('Не указано имя пользователя для старого ключа');

    const salt = new TextEncoder().encode(`${username}_key_enc`);
    const wrappingKey = await deriveWrappingKey(password, salt, 10_000, ['decrypt']);
    return webCrypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToArrayBuffer(keyEnvelope.iv),
      },
      wrappingKey,
      base64ToArrayBuffer(keyEnvelope.ciphertext)
    );
  }

  if (
    keyEnvelope?.version !== 2 ||
    keyEnvelope.kdf?.name !== 'PBKDF2' ||
    keyEnvelope.kdf?.hash !== 'SHA-256' ||
    keyEnvelope.cipher?.name !== 'AES-GCM'
  ) {
    throw new Error('Неподдерживаемый формат контейнера ключа');
  }

  const iterations = keyEnvelope.kdf.iterations;
  if (
    !Number.isInteger(iterations) ||
    iterations < KEY_ENVELOPE_V2_ITERATIONS ||
    iterations > KEY_ENVELOPE_V2_MAX_ITERATIONS
  ) {
    throw new Error('Недопустимые параметры KDF');
  }

  const salt = new Uint8Array(base64ToArrayBuffer(keyEnvelope.kdf.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(keyEnvelope.cipher.iv));
  if (salt.byteLength < KEY_ENVELOPE_V2_SALT_BYTES || iv.byteLength !== AES_GCM_IV_BYTES) {
    throw new Error('Недопустимые параметры шифрования');
  }

  const wrappingKey = await deriveWrappingKey(password, salt, iterations, ['decrypt']);
  return webCrypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: KEY_ENVELOPE_V2_AAD,
      tagLength: 128,
    },
    wrappingKey,
    base64ToArrayBuffer(keyEnvelope.cipher.ciphertext)
  );
}

export async function importVerifiedPrivateKey(privateKeyPkcs8, publicKey) {
  const webCrypto = getWebCrypto();
  const algorithm = { name: 'ECDH', namedCurve: 'P-256' };
  const validationKey = await webCrypto.subtle.importKey(
    'pkcs8',
    privateKeyPkcs8,
    algorithm,
    true,
    ['deriveBits', 'deriveKey']
  );
  const privateJwk = await webCrypto.subtle.exportKey('jwk', validationKey);

  if (privateJwk.x !== publicKey?.x || privateJwk.y !== publicKey?.y) {
    throw new Error('Приватный ключ не соответствует публичному ключу аккаунта');
  }

  return webCrypto.subtle.importKey(
    'pkcs8',
    privateKeyPkcs8,
    algorithm,
    false,
    ['deriveBits', 'deriveKey']
  );
}

export async function unlockKeyEnvelope({
  keyEnvelope,
  password,
  username,
  publicKey,
}) {
  const privateKeyPkcs8 = await decryptKeyEnvelope(
    keyEnvelope,
    password,
    username
  );

  try {
    const privateKey = await importVerifiedPrivateKey(
      privateKeyPkcs8,
      publicKey
    );
    const migratedEnvelope = keyEnvelope.version === 1
      ? await createKeyEnvelopeV2(privateKeyPkcs8, password)
      : null;

    return { privateKey, migratedEnvelope };
  } finally {
    new Uint8Array(privateKeyPkcs8).fill(0);
  }
}

export async function fetchKeyEnvelope(accessToken) {
  if (!accessToken) throw new Error('Отсутствует токен сессии');

  const response = await fetch('/me/key-envelope', {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Не удалось получить контейнер ключа');
  }

  return response.json();
}

export async function updateKeyEnvelope(accessToken, password, keyEnvelope) {
  if (!accessToken) throw new Error('Отсутствует токен сессии');

  const response = await fetch('/me/key-envelope', {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password, key_envelope: keyEnvelope }),
  });

  if (!response.ok) {
    throw new Error('Не удалось обновить защиту контейнера ключа');
  }

  return response.json();
}

export async function decryptMessagePacket(msg, myPrivateKey, currentUsername) {
  try {
    const webCrypto = getWebCrypto();
    const partner = msg.from === currentUsername ? msg.to : msg.from;
    const res = await fetch(`/user/${partner}`);
    const partnerData = await res.json();
    const partnerPublicKey = await webCrypto.subtle.importKey(
      'jwk',
      partnerData.public_key,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const aesKey = await webCrypto.subtle.deriveKey(
      { name: 'ECDH', public: partnerPublicKey },
      myPrivateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const decryptedRaw = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(msg.iv) },
      aesKey,
      base64ToArrayBuffer(msg.ciphertext)
    );

    return new TextDecoder().decode(decryptedRaw);
  } catch {
    return '[Ошибка расшифровки пакета]';
  }
}
