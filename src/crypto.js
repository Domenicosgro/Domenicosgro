import { gcm }         from '@noble/ciphers/aes.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { pbkdf2 }      from '@noble/hashes/pbkdf2.js'
import { sha256 }      from '@noble/hashes/sha2.js'

const PBKDF2_ITERATIONS = 310_000
const KEY_LEN           = 32  // AES-256

function bytesToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function b64ToBytes(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

export function newSalt() {
  return bytesToB64(randomBytes(32))
}

// Returns a raw Uint8Array key (32 bytes, AES-256).
// Uses the same PBKDF2-SHA256 parameters and AES-256-GCM cipher as the
// previous Web Crypto implementation — all existing encrypted data continues
// to work without migration.
export async function deriveKey(password, saltB64) {
  const salt = b64ToBytes(saltB64)
  const pw   = new TextEncoder().encode(password)
  return pbkdf2(sha256, pw, salt, { c: PBKDF2_ITERATIONS, dkLen: KEY_LEN })
}

export async function encryptJSON(key, data) {
  const iv        = randomBytes(12)
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const cipher    = gcm(key, iv)
  const ciphertext = cipher.encrypt(plaintext)
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(ciphertext) }
}

export async function decryptJSON(key, ivB64, ciphertextB64) {
  const iv     = b64ToBytes(ivB64)
  const cipher = gcm(key, iv)
  const buf    = cipher.decrypt(b64ToBytes(ciphertextB64))
  return JSON.parse(new TextDecoder().decode(buf))
}
