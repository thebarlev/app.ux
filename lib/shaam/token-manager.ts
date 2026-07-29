import "server-only"

import { getShaamConfig, getShaamEnvSafe } from "@/lib/shaam/config"
import { getShaamDispatcher } from "@/lib/shaam/dispatcher"
import { decryptSecret, encryptSecret } from "@/lib/shaam/crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { markConnectionError, recordShaamEvent } from "@/lib/shaam/tokens"

export class NeedsReauthError extends Error {
  readonly code: string
  constructor(code: string, message = "needs_reauth") {
    super(message)
    this.name = "NeedsReauthError"
    this.code = code
  }
}

export class ShaamTransientError extends Error {
  readonly code: string
  constructor(code: string, message = "shaam_transient_error") {
    super(message)
    this.name = "ShaamTransientError"
    this.code = code
  }
}

function now() {
  return new Date()
}

function parseIsoMs(iso: string | null | undefined): number {
  if (!iso) return NaN
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : NaN
}

function safeTokenError(params: { status: number; json: any }): { code: string; message: string } {
  const status = Number(params.status) || 0
  const code = typeof params.json?.error === "string" ? params.json.error : `http_${status}`
  const msgRaw =
    typeof params.json?.error_description === "string"
      ? params.json.error_description
      : typeof params.json?.message === "string"
        ? params.json.message
        : "shaam_token_failed"
  return { code, message: String(msgRaw).slice(0, 500) }
}

function looksLikeNeedsReauth(params: { status: number; code: string; message: string }): boolean {
  if (params.status === 401) return true
  const c = String(params.code || "").toLowerCase()
  const m = String(params.message || "").toLowerCase()
  return (
    params.status === 400 ||
    c.includes("invalid_grant") ||
    c.includes("invalid_token") ||
    m.includes("invalid_grant") ||
    m.includes("invalid token") ||
    m.includes("invalid_token")
  )
}

async function refreshAccessToken(params: { companyId: string; refreshToken: string }) {
  const cfg = getShaamConfig()

  // ITA token endpoint expects client credentials via HTTP Basic auth, not in the body.
  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", params.refreshToken)

  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")

  // Proxy when SHAAM_HTTPS_PROXY is set, else IPv4 + timeout (same as callback)
  const dispatcher = getShaamDispatcher({ ipv4Fallback: true })

  let res: Response
  let json: any = null
  try {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        authorization: `Basic ${basicAuth}`,
      },
      body,
      cache: "no-store",
      ...(dispatcher ? { dispatcher } : {}),
      signal: AbortSignal.timeout(20_000),
    })
    json = await res.json().catch(() => null)
  } catch (e: any) {
    const code = e?.cause?.code || e?.code || "token_refresh_fetch_failed"
    const msg = e?.message || "fetch_failed"
    throw new ShaamTransientError(String(code), String(msg).slice(0, 500))
  }

  if (!res.ok) {
    const safe = safeTokenError({ status: res.status, json })
    if (looksLikeNeedsReauth({ status: res.status, code: safe.code, message: safe.message })) {
      throw new NeedsReauthError(safe.code, safe.message)
    }
    throw new ShaamTransientError(safe.code, safe.message)
  }

  // Non-secret visibility: response KEYS only (never values/tokens).
  console.log("[shaam][refresh] token_response_keys", {
    keys: json && typeof json === "object" ? Object.keys(json) : null,
  })

  const accessToken = typeof json?.access_token === "string" ? String(json.access_token) : ""
  const expiresIn = typeof json?.expires_in === "number" ? Number(json.expires_in) : NaN
  const refreshExpiresIn = typeof json?.refresh_token_expires_in === "number" ? Number(json.refresh_token_expires_in) : NaN
  const refreshTokenNew = typeof json?.refresh_token === "string" ? String(json.refresh_token).trim() : ""
  const tokenType = typeof json?.token_type === "string" ? String(json.token_type).trim() : ""
  const scope = typeof json?.scope === "string" ? String(json.scope) : null

  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ShaamTransientError("bad_response", "missing_access_token_or_expires_in")
  }

  return {
    accessToken,
    expiresInSeconds: Math.floor(expiresIn),
    refreshExpiresInSeconds: Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0 ? Math.floor(refreshExpiresIn) : null,
    refreshToken: refreshTokenNew || null,
    tokenType: tokenType || null,
    scope,
    providerJson: json,
  }
}

export async function markNeedsReauth(companyId: string, code: string, message: string) {
  await markConnectionError({ companyId, status: "expired", errorCode: code, errorMessage: message })
}

export async function markError(companyId: string, code: string, message: string) {
  await markConnectionError({ companyId, status: "error", errorCode: code, errorMessage: message })
}

export type GetValidShaamAccessTokenOptions = {
  /**
   * Forces a refresh call even if `expires_at` is still in the future.
   * Useful when SHAAM returns 401 for an apparently-valid token.
   */
  forceRefresh?: boolean
}

/**
 * Returns a valid SHAAM access token for the given companyId.
 * - Never returns secrets to the client (server-only).
 * - Refreshes if token is expired/near-expiry.
 * - Throws NeedsReauthError when the user must reconnect.
 */
export async function getValidShaamAccessToken(companyId: string, opts?: GetValidShaamAccessTokenOptions): Promise<string> {
  const admin = createServiceRoleClient()

  const { data: row, error } = await admin
    .from("company_shaam_connections")
    .select("access_token, refresh_token, expires_at, status")
    .eq("company_id", companyId)
    .eq("env", getShaamEnvSafe())
    .maybeSingle()

  if (error) throw new ShaamTransientError("db_error", "db_error")
  if (!row) throw new NeedsReauthError("not_connected", "not_connected")

  const status = String((row as any).status || "error")
  if (status === "revoked") throw new NeedsReauthError("revoked", "revoked")

  const atEnc = (row as any).access_token
  const rtEnc = (row as any).refresh_token
  if (!atEnc || !rtEnc) {
    throw new NeedsReauthError("missing_tokens", "missing_tokens")
  }

  const expiresAtMs = parseIsoMs((row as any).expires_at ? String((row as any).expires_at) : null)
  const skewMs = 60_000
  if (!opts?.forceRefresh && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + skewMs && status === "active") {
    return decryptSecret(String(atEnc))
  }

  // Refresh flow
  const refreshToken = decryptSecret(String(rtEnc))
  try {
    const refreshed = await refreshAccessToken({ companyId, refreshToken })

    const issuedAt = now()
    const newExpiresAt = new Date(issuedAt.getTime() + refreshed.expiresInSeconds * 1000).toISOString()
    // Only advance refresh_expires_at when ITA actually returned a lifetime;
    // otherwise leave the column untouched (don't clobber a known value with null).
    const refreshExpiresPatch =
      refreshed.refreshExpiresInSeconds != null
        ? { refresh_expires_at: new Date(issuedAt.getTime() + refreshed.refreshExpiresInSeconds * 1000).toISOString() }
        : {}

    await admin
      .from("company_shaam_connections")
      .update({
        access_token: encryptSecret(refreshed.accessToken),
        refresh_token: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : (row as any).refresh_token,
        token_type: refreshed.tokenType || "Bearer",
        issued_at: issuedAt.toISOString(),
        expires_at: newExpiresAt,
        access_expires_at: newExpiresAt,
        ...refreshExpiresPatch,
        last_refresh_at: issuedAt.toISOString(),
        status: "active",
        revoked_at: null,
        scopes: refreshed.scope,
        last_error_code: null,
        last_error_message: null,
      } as any)
      .eq("company_id", companyId)
      .eq("env", getShaamEnvSafe())

    await recordShaamEvent({ companyId, eventType: "oauth_refresh", payload: { status: "active", expires_at: newExpiresAt } })

    return refreshed.accessToken
  } catch (e: any) {
    if (e instanceof NeedsReauthError) {
      await markNeedsReauth(companyId, e.code || "needs_reauth", e.message || "needs_reauth")
      throw e
    }
    if (e instanceof ShaamTransientError) {
      await markError(companyId, e.code || "transient_error", e.message || "transient_error")
      throw e
    }
    await markError(companyId, "unknown_error", String(e?.message || e).slice(0, 500))
    throw new ShaamTransientError("unknown_error", "unknown_error")
  }
}

