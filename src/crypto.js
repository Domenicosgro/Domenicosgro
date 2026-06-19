const PBKDF2_ITERATIONS = 310_000

function bytesToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function b64ToBytes(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

function requireSubtle() {
  if (!crypto?.subtle) {
    throw new Error(
      'Verschlüsselung benötigt HTTPS oder localhost. ' +
      'Diese Verbindung ist nicht sicher genug (HTTP über LAN). ' +
      'Bitte rufen Sie die App über https:// oder localhost auf.'
    )
  }
}

export function newSalt() {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(32)))
}

export async function deriveKey(password, saltB64) {
  requireSubtle()
  const salt    = b64ToBytes(saltB64)
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  )
}

export async function encryptJSON(key, data) {
  requireSubtle()
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify(data))
  )
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(buf) }
}

export async function decryptJSON(key, ivB64, ciphertextB64) {
  requireSubtle()
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) }, key, b64ToBytes(ciphertextB64)
  )
  return JSON.parse(new TextDecoder().decode(buf))
}
