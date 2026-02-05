import "server-only"

import { createHmac, timingSafeEqual } from "crypto"

type UpgradeStatePayload = {
  company_id: string
  iat: number
  exp: number
}

function base64UrlEncode(input: Buffer | string): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8")
  return b
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/")
  const padLen = (4 - (b64.length % 4)) % 4
  const padded = b64 + "=".repeat(padLen)
  return Buffer.from(padded, "base64")
}

function sign(input: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(input).digest())
}

export function signUpgradeState(payload: UpgradeStatePayload): string {
  const secret = process.env.UPGRADE_STATE_SECRET
  if (!secret) {
    throw new Error("Missing UPGRADE_STATE_SECRET")
  }
  const json = JSON.stringify(payload)
  const body = base64UrlEncode(json)
  const sig = sign(body, secret)
  return `${body}.${sig}`
}

export function verifyUpgradeState(state: string): { ok: true; payload: UpgradeStatePayload } | { ok: false } {
  const secret = process.env.UPGRADE_STATE_SECRET
  if (!secret) return { ok: false }

  const [body, sig] = String(state || "").split(".", 2)
  if (!body || !sig) return { ok: false }

  const expected = sign(body, secret)
  // Convert to Uint8Array backed by ArrayBuffer for TS compatibility.
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
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return { ok: false }
  if (payload.exp < now) return { ok: false }

  return { ok: true, payload: payload as UpgradeStatePayload }
}

