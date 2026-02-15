import "server-only"

import { createDecipheriv, createCipheriv, randomBytes } from "crypto"
import { TextDecoder, TextEncoder } from "util"
type BytesLike = Uint8Array | Buffer

type KeyMaterial = { key: Uint8Array }

let cachedKey: KeyMaterial | null = null

function base64UrlEncode(bytes: Uint8Array): string {
  // Using Buffer only for base64 encoding of a Uint8Array (type-safe in TS)
  return Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/")
  const padLen = (4 - (b64.length % 4)) % 4
  const buf = Buffer.from(b64 + "=".repeat(padLen), "base64")
  // Convert Buffer -> Uint8Array without relying on Buffer typing as Uint8Array
  return Uint8Array.from(buf)
}

function loadKey(): KeyMaterial {
  if (cachedKey) return cachedKey

  const raw = (process.env.ENCRYPTION_KEY || "").trim()
  if (!raw) throw new Error("Missing ENCRYPTION_KEY")

  const tryParse = (): Uint8Array | null => {
    // base64url
    try {
      const b = base64UrlDecode(raw)
      if (b.length === 32) return b
    } catch {}

    // base64
    try {
      const buf = Buffer.from(raw, "base64")
      if (buf.length === 32) return Uint8Array.from(buf)
    } catch {}

    // hex
    try {
      const buf = Buffer.from(raw, "hex")
      if (buf.length === 32) return Uint8Array.from(buf)
    } catch {}

    return null
  }

  const key = tryParse()
  if (!key) throw new Error("ENCRYPTION_KEY must decode to 32 bytes")

  cachedKey = { key }
  return cachedKey
}

function toU8(x: BytesLike): Uint8Array {
  // IMPORTANT:
  // Never return Buffer directly (even though Buffer is a Uint8Array at runtime).
  // Next.js/TS typechecking can treat Buffer's underlying ArrayBufferLike as incompatible.
  // Returning a plain Uint8Array copy avoids those type issues.
  if (x instanceof Uint8Array) return new Uint8Array(x)
  // Fallback (should be unreachable because BytesLike is Uint8Array|Buffer)
  return Uint8Array.from(x as any)
}

function concatU8(a: BytesLike, b: BytesLike): Uint8Array {
  const ua = toU8(a)
  const ub = toU8(b)

  const out = new Uint8Array(ua.length + ub.length)
  out.set(ua, 0)
  out.set(ub, ua.length)
  return out
}


/**
 * Encrypted format:
 *   v1.<iv_b64url>.<ciphertext_b64url>.<tag_b64url>
 */
export function encryptSecret(plaintext: string): string {
  const { key } = loadKey()

  const iv = Uint8Array.from(randomBytes(12)) // 12 bytes for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv)

  const enc = new TextEncoder()
  const p1 = cipher.update(enc.encode(String(plaintext)))
  const p2 = cipher.final()

  const ciphertext = concatU8(p1, p2)
  const tag = cipher.getAuthTag()
  const tagU8 = Uint8Array.from(tag)

  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}.${base64UrlEncode(tagU8)}`
}

export function decryptSecret(encrypted: string): string {
  const { key } = loadKey()

  const s = String(encrypted || "")
  const [v, ivB64, ctB64, tagB64] = s.split(".", 4)
  if (v !== "v1" || !ivB64 || !ctB64 || !tagB64) throw new Error("bad_encrypted_format")

  const iv = base64UrlDecode(ivB64)
  const ciphertext = base64UrlDecode(ctB64)
  const tag = base64UrlDecode(tagB64)

  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)

  const p1 = decipher.update(ciphertext)
  const p2 = decipher.final()

  const plaintextBytes = concatU8(p1, p2)
  const dec = new TextDecoder()
  return dec.decode(plaintextBytes)
}
