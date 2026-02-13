import "server-only"

import { createDecipheriv, createCipheriv, randomBytes } from "crypto"

type KeyMaterial = { key: Buffer }

let cachedKey: KeyMaterial | null = null

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function base64UrlDecode(input: string): Buffer {
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/")
  const padLen = (4 - (b64.length % 4)) % 4
  return Buffer.from(b64 + "=".repeat(padLen), "base64")
}

function loadKey(): KeyMaterial {
  if (cachedKey) return cachedKey
  const raw = (process.env.ENCRYPTION_KEY || "").trim()
  if (!raw) throw new Error("Missing ENCRYPTION_KEY")

  const tryParse = (): Buffer | null => {
    // base64url/base64
    try {
      const b = base64UrlDecode(raw)
      if (b.length === 32) return b
    } catch {}
    try {
      const b = Buffer.from(raw, "base64")
      if (b.length === 32) return b
    } catch {}
    // hex
    try {
      const b = Buffer.from(raw, "hex")
      if (b.length === 32) return b
    } catch {}
    return null
  }

  const key = tryParse()
  if (!key) throw new Error("ENCRYPTION_KEY must decode to 32 bytes")
  cachedKey = { key }
  return cachedKey
}

/**
 * Encrypted format:
 *   v1.<iv_b64url>.<ciphertext_b64url>.<tag_b64url>
 */
export function encryptSecret(plaintext: string): string {
  const { key } = loadKey()
  const iv = randomBytes(12) // recommended size for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(String(plaintext), "utf8")), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}.${base64UrlEncode(tag)}`
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
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString("utf8")
}

