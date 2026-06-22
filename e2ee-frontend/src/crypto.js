export const arrayBufferToBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

export const base64ToArrayBuffer = (base64) => {
  if (!base64) throw new Error("Передан пустой Base64");
  return Uint8Array.from(atob(base64.replace(/[^A-Za-z0-9+/=]/g, "")), c => c.charCodeAt(0)).buffer;
};

export async function derivePasswordKey(password, username) {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode(username + "_salt"), iterations: 10000, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export async function decryptMessagePacket(msg, myPrivateKey, currentUsername) {
  try {
    const partner = msg.from === currentUsername ? msg.to : msg.from;
    const res = await fetch(`http://127.0.0.2:8000/user/${partner}`);
    const partnerData = await res.json();
    const partnerPublicKey = await window.crypto.subtle.importKey("jwk", partnerData.public_key, { name: "ECDH", namedCurve: "P-256" }, true, []);
    
    const aesKey = await window.crypto.subtle.deriveKey({ name: "ECDH", public: partnerPublicKey }, myPrivateKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const decryptedRaw = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToArrayBuffer(msg.iv) }, aesKey, base64ToArrayBuffer(msg.ciphertext));
    
    return new TextDecoder().decode(decryptedRaw);
  } catch (err) {
    return "[Ошибка расшифровки пакета]";
  }
}