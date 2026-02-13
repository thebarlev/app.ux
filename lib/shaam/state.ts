import "server-only"

import { createHmac, randomUUID, timingSafeEqual } from "crypto"

export type ShaamOauthStatePayload = {
  company_id: string
  user_id: string
  nonce: string
  iat: number
  exp: number
}

const STATE_TTL_SECONDS = 10 * 60

function base64UrlEncode(input: Buffer | string): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8")
  return b.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/")
  const padLen = (4 - (b64.length % 4)) % 4
  const padded = b64 + "=".repeat(padLen)
  return Buffer.from(padded, "base64")
}

function sign(bodyB64Url: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(bodyB64Url).digest())
}

function getSecret(): string {
  const s = process.env.SHAAM_OAUTH_STATE_SECRET
  if (!s || !String(s).trim()) throw new Error("Missing SHAAM_OAUTH_STATE_SECRET")
  return String(s).trim()
}

export function createShaamOauthState(params: { companyId: string; userId: string }): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: ShaamOauthStatePayload = {
    company_id: params.companyId,
    user_id: params.userId,
    nonce: randomUUID(),
    iat: now,
    exp: now + STATE_TTL_SECONDS,
  }
  const body = base64UrlEncode(JSON.stringify(payload))
  const sig = sign(body, getSecret())
  return `${body}.${sig}`
}

export function verifyShaamOauthState(state: string): { ok: true; payload: ShaamOauthStatePayload } | { ok: false } {
  const secret = process.env.SHAAM_OAUTH_STATE_SECRET
  if (!secret || !String(secret).trim()) return { ok: false }

  const [body, sig] = String(state || "").split(".", 2)
  if (!body || !sig) return { ok: false }

  const expected = sign(body, String(secret).trim())
  const a = Uint8Array.from(Buffer.from(sig))
  const b = Uint8Array.from(Buffer.from(expected))
  if (a.length !== b.length) return { ok: false }
  if (!timingSafeEqual(a, b)) return { ok: false }

  let payload: any
  try {
    payload = JSON.parse(base64UrlDecodeToBuffer(body).toString("utf8"))
  } catch {
    return { ok: false }
  }

  const now = Math.floor(Date.now() / 1000)
  if (!payload || typeof payload.company_id !== "string") return { ok: false }
  if (typeof payload.user_id !== "string") return { ok: false }
  if (typeof payload.nonce !== "string") return { ok: false }
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return { ok: false }
  if (payload.exp < now) return { ok: false }

  return { ok: true, payload: payload as ShaamOauthStatePayload }
}

