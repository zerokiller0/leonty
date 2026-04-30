/* Web Crypto helpers for E2EE.
   - Per-user RSA-OAEP 2048 keypair (generated at registration).
   - Private key is encrypted client-side with an AES-GCM key derived via PBKDF2 from user password.
   - Server stores only: public_key (PEM), encrypted_private_key, key_salt.
   - DMs: sender encrypts plaintext with the recipient's public key AND with their own public key (so sender can re-read).
*/

const enc = new TextEncoder();
const dec = new TextDecoder();

function buf2b64(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}
function b642buf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function generateKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const publicKey = await crypto.subtle.exportKey("spki", kp.publicKey);
  const privateKey = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  return {
    publicKeyB64: buf2b64(publicKey),
    privateKeyB64: buf2b64(privateKey),
  };
}

async function deriveAesKey(password, saltB64) {
  const salt = new Uint8Array(b642buf(saltB64));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPrivateKey(privateKeyB64, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = buf2b64(salt.buffer);
  const aesKey = await deriveAesKey(password, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    b642buf(privateKeyB64),
  );
  // pack iv + ct into base64
  const pack = new Uint8Array(iv.length + new Uint8Array(ct).length);
  pack.set(iv, 0);
  pack.set(new Uint8Array(ct), iv.length);
  return { encryptedPrivateKeyB64: buf2b64(pack.buffer), saltB64 };
}

export async function decryptPrivateKey(encryptedB64, password, saltB64) {
  const aesKey = await deriveAesKey(password, saltB64);
  const pack = new Uint8Array(b642buf(encryptedB64));
  const iv = pack.slice(0, 12);
  const ct = pack.slice(12);
  const pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
  return buf2b64(pkcs8);
}

export async function importPublicKey(publicKeyB64) {
  return crypto.subtle.importKey(
    "spki",
    b642buf(publicKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"],
  );
}

export async function importPrivateKey(privateKeyB64) {
  return crypto.subtle.importKey(
    "pkcs8",
    b642buf(privateKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"],
  );
}

// RSA-OAEP max plaintext for 2048bit = 190 bytes. Use hybrid: AES-GCM key + RSA wrap.
export async function encryptForPublicKey(plaintext, publicKeyB64) {
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(plaintext));
  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const pub = await importPublicKey(publicKeyB64);
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, rawKey);
  // pack: wrappedKey_len(2B) | wrappedKey | iv(12B) | ct
  const wkArr = new Uint8Array(wrappedKey);
  const ctArr = new Uint8Array(ct);
  const out = new Uint8Array(2 + wkArr.length + 12 + ctArr.length);
  new DataView(out.buffer).setUint16(0, wkArr.length);
  out.set(wkArr, 2);
  out.set(iv, 2 + wkArr.length);
  out.set(ctArr, 2 + wkArr.length + 12);
  return buf2b64(out.buffer);
}

export async function decryptWithPrivateKey(ciphertextB64, privateKeyB64) {
  const priv = await importPrivateKey(privateKeyB64);
  const bytes = new Uint8Array(b642buf(ciphertextB64));
  const wkLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0);
  const wrappedKey = bytes.slice(2, 2 + wkLen);
  const iv = bytes.slice(2 + wkLen, 2 + wkLen + 12);
  const ct = bytes.slice(2 + wkLen + 12);
  const rawKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, priv, wrappedKey);
  const aesKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
  return dec.decode(pt);
}

export async function fingerprint(publicKeyB64) {
  const hash = await crypto.subtle.digest("SHA-256", b642buf(publicKeyB64));
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.match(/.{1,4}/g).slice(0, 8).join(" ");
}
