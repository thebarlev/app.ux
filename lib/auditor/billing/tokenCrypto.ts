import crypto from "node:crypto"
import { getAuditorBillingConfig } from "./env"

type EncryptedTokenV1 = {
  v: 1
  alg: "A256GCM"
  iv_b64: string
  ct_b64: string
  tag_b64: string
}

function getKeyBytes(): Buffer {
  const cfg = getAuditorBillingConfig()
  const raw = String(cfg.tokenEncryptionKeyB64 || "").trim()
  if (!raw) throw new Error("Missing AUDITOR_TOKEN_ENCRYPTION_KEY (required for token encryption)")

  // Preferred: base64(32 bytes). In development we also support any string by deriving
  // a stable 32-byte key via SHA-256, so existing `ENCRYPTION_KEY` can be reused safely.
  const asB64 = Buffer.from(raw, "base64")
  if (asB64.length === 32) return asB64

  return crypto.createHash("sha256").update(raw, "utf8").digest()
}

function toUint8Copy(bytes: ArrayLike<number>): Uint8Array {
  // TS-safe copy into a "plain" Uint8Array (ArrayBuffer-backed).
  // This avoids Buffer<ArrayBufferLike> vs ArrayBufferView typing issues in newer Node typings.
  return Uint8Array.from(bytes)
}

function concatToBuffer(chunks: Array<Uint8Array>): Buffer {
  let total = 0
  for (const c of chunks) total += c.byteLength
  const out = Buffer.allocUnsafe(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

export function tokenHashSha256(token: string): string {
  const normalized = String(token || "").trim()
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex")
}

export function encryptToken(token: string): string {
  const keyBuf = getKeyBytes()
  const ivBuf = crypto.randomBytes(12)

  const key = toUint8Copy(keyBuf)
  const iv = toUint8Copy(ivBuf)

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ct = concatToBuffer([
    toUint8Copy(cipher.update(String(token || ""), "utf8")),
    toUint8Copy(cipher.final()),
  ])
  const tag = cipher.getAuthTag()

  const payload: EncryptedTokenV1 = {
    v: 1,
    alg: "A256GCM",
    iv_b64: ivBuf.toString("base64"),
    ct_b64: ct.toString("base64"),
    tag_b64: tag.toString("base64"),
  }
  return JSON.stringify(payload)
}

export function decryptToken(tokenEnc: string): string {
  const keyBuf = getKeyBytes()

  const parsed = JSON.parse(String(tokenEnc || "")) as Partial<EncryptedTokenV1>
  if (parsed?.v !== 1 || parsed?.alg !== "A256GCM") throw new Error("Invalid encrypted token format")
  if (!parsed.iv_b64 || !parsed.ct_b64 || !parsed.tag_b64) throw new Error("Invalid encrypted token payload")

  const ivBuf = Buffer.from(parsed.iv_b64, "base64")
  const ct = Buffer.from(parsed.ct_b64, "base64")
  const tag = Buffer.from(parsed.tag_b64, "base64")

  const key = toUint8Copy(keyBuf)
  const iv = toUint8Copy(ivBuf)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(toUint8Copy(tag))

  const pt = concatToBuffer([
    toUint8Copy(decipher.update(toUint8Copy(ct))),
    toUint8Copy(decipher.final()),
  ])
  return pt.toString("utf8")
}