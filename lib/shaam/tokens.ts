import "server-only"

import { getShaamConfig, getShaamEnv, getShaamEnvSafe } from "@/lib/shaam/config"
import { getShaamDispatcher } from "@/lib/shaam/dispatcher"
import { decryptSecret, encryptSecret } from "@/lib/shaam/crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"

export type ShaamConnectionStatus = "active" | "expired" | "revoked" | "error"

/**
 * The connection row could not be written.
 *
 * Thrown rather than returned because the one caller — the OAuth callback —
 * discards return values, and a swallowed failure here is exactly the defect
 * this type exists to end: between 29/07 and 18/08 every token upsert returned
 * 42P10 (the code half of a0889cc was unmerged, so `onConflict` named
 * `company_id` while the live primary key was `(company_id, env)`), the error
 * was never destructured, and `oauth_connected` was written anyway. The screen
 * showed a green banner over a connection that did not exist.
 */
export class ShaamConnectionPersistError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "ShaamConnectionPersistError"
    this.code = code
  }
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in: number
  // Long-lived refresh-token lifetime (~89d) returned by ITA as
  // `refresh_token_expires_in`. Optional: older rows / partial responses omit it.
  refresh_expires_in?: number
  scope?: string
}

type RefreshResponse = Partial<TokenResponse> & { access_token?: string; expires_in?: number }

function nowIso() {
  return new Date().toISOString()
}

function toExpiresAtIso(issuedAt: Date, expiresInSeconds: number): string {
  const sec = Number(expiresInSeconds)
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error("invalid_expires_in")
  }
  return new Date(issuedAt.getTime() + sec * 1000).toISOString()
}

function safeErrorFromTokenEndpoint(params: { status: number; json: any }): { code: string; message: string } {
  const status = Number(params.status) || 0
  const code = typeof params.json?.error === "string" ? params.json.error : `http_${status}`
  const msgRaw =
    typeof params.json?.error_description === "string"
      ? params.json.error_description
      : typeof params.json?.message === "string"
        ? params.json.message
        : "shaam_oauth_failed"
  // Never include response bodies or fields that might accidentally contain secrets.
  const message = String(msgRaw).slice(0, 500)
  return { code, message }
}

export async function recordShaamEvent(params: {
  companyId: string
  eventType:
    | "oauth_start"
    | "oauth_connected"
    | "oauth_error"
    | "oauth_refresh"
    | "oauth_expired"
    | "oauth_revoked"
    | "allocation_request"
    | "allocation_received"
    | "allocation_failed"
    | "decision_cancel"
    | "decision_continue"
    | "decision_further_objection"
  payload?: Record<string, any> | null
}) {
  const admin = createServiceRoleClient()
  // payload MUST be token-free by convention; keep it small.
  const base = params.payload ? JSON.parse(JSON.stringify(params.payload)) : {}
  // Tag every event with the tier it happened on, so sandbox and production
  // history stay tellable apart in the same table.
  const payload = { ...base, shaam_env: getShaamEnvSafe() }
  await admin.from("shaam_events").insert({
    company_id: params.companyId,
    event_type: params.eventType,
    payload_json: payload,
  })
}

export async function upsertConnectionFromTokenResponse(params: {
  companyId: string
  token: TokenResponse
  issuedAt?: Date
}) {
  const issuedAt = params.issuedAt ?? new Date()
  const expiresAt = toExpiresAtIso(issuedAt, params.token.expires_in)
  // Refresh-token expiry is the real ITA value when present; otherwise leave null.
  const refreshExpiresAt =
    typeof params.token.refresh_expires_in === "number" && params.token.refresh_expires_in > 0
      ? new Date(issuedAt.getTime() + Math.floor(params.token.refresh_expires_in) * 1000).toISOString()
      : null
  const admin = createServiceRoleClient()

  // supabase-js does NOT throw on a database error — it returns it. Destructuring
  // `error` is the whole difference between a connection that was saved and one
  // that only looked saved.
  const { error } = await admin.from("company_shaam_connections").upsert(
    {
      company_id: params.companyId,
      env: getShaamEnv(),
      provider: "shaam",
      access_token: encryptSecret(params.token.access_token),
      refresh_token: encryptSecret(params.token.refresh_token),
      token_type: params.token.token_type || "Bearer",
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt,
      access_expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      connected_at: nowIso(),
      last_refresh_at: null,
      revoked_at: null,
      scopes: params.token.scope || null,
      status: "active",
      last_error_code: null,
      last_error_message: null,
    },
    { onConflict: "company_id,env" }
  )

  if (error) {
    const code = String((error as any)?.code || "db_error").slice(0, 120)
    const message = String((error as any)?.message || "connection_upsert_failed").slice(0, 500)

    // 'oauth_connected' is a claim that the tokens are stored. They are not, so
    // the event that goes in is the one that is true.
    await recordShaamEvent({
      companyId: params.companyId,
      eventType: "oauth_error",
      payload: {
        status: "error",
        stage: "connection_upsert",
        last_error_code: code,
        last_error_message: message,
      },
    })

    throw new ShaamConnectionPersistError(code, message)
  }

  // Reached only when the row is actually on disk.
  await recordShaamEvent({
    companyId: params.companyId,
    eventType: "oauth_connected",
    payload: { status: "active", expires_at: expiresAt, scopes: params.token.scope || null },
  })
}

/**
 * Records a failed connection attempt on the row and in the event log.
 *
 * Returns rather than throws — every one of its seven callers is already on an
 * error path, and throwing here would replace a meaningful error redirect with
 * a 500 and bury the original failure. The persistence failure is still made
 * loud: it goes into the event payload, so the trace survives even when the
 * row does not.
 */
export async function markConnectionError(params: {
  companyId: string
  status: Exclude<ShaamConnectionStatus, "revoked" | "active">
  errorCode: string
  errorMessage: string
}): Promise<{ ok: true } | { ok: false; persistErrorCode: string; persistErrorMessage: string }> {
  const admin = createServiceRoleClient()
  // We must supply expires_at if inserting a new row; if row doesn't exist, we create an \"error\" shell.
  const now = new Date()
  const shellExpiresAt = now.toISOString()

  const errorCode = String(params.errorCode || "").slice(0, 120) || null
  const errorMessage = String(params.errorMessage || "").slice(0, 500) || null

  // Same rule as the success path: supabase-js returns the error, it does not throw.
  const { error } = await admin.from("company_shaam_connections").upsert(
    {
      company_id: params.companyId,
      env: getShaamEnvSafe(),
      provider: "shaam",
      expires_at: shellExpiresAt,
      issued_at: shellExpiresAt,
      connected_at: shellExpiresAt,
      status: params.status,
      last_error_code: errorCode,
      last_error_message: errorMessage,
    },
    { onConflict: "company_id,env" }
  )

  const persistErrorCode = error ? String((error as any)?.code || "db_error").slice(0, 120) : null
  const persistErrorMessage = error
    ? String((error as any)?.message || "connection_upsert_failed").slice(0, 500)
    : null

  if (persistErrorCode) {
    console.error("[shaam][tokens] markConnectionError: connection row was not written", {
      company_id: params.companyId,
      persist_error_code: persistErrorCode,
    })
  }

  await recordShaamEvent({
    companyId: params.companyId,
    eventType: params.status === "expired" ? "oauth_expired" : "oauth_error",
    payload: {
      status: params.status,
      last_error_code: errorCode,
      last_error_message: errorMessage,
      // Present only when the row itself could not be written, so the log never
      // implies a persisted state that does not exist.
      ...(persistErrorCode
        ? {
            connection_row_persisted: false,
            persist_error_code: persistErrorCode,
            persist_error_message: persistErrorMessage,
          }
        : {}),
    },
  })

  if (persistErrorCode) {
    return { ok: false, persistErrorCode, persistErrorMessage: persistErrorMessage as string }
  }
  return { ok: true }
}

export async function disconnectShaam(params: { companyId: string }) {
  const admin = createServiceRoleClient()
  const now = nowIso()
  await admin
    .from("company_shaam_connections")
    .update({
      status: "revoked",
      revoked_at: now,
      access_token: null,
      refresh_token: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("company_id", params.companyId)
    .eq("env", getShaamEnvSafe())

  await recordShaamEvent({ companyId: params.companyId, eventType: "oauth_revoked", payload: { status: "revoked" } })
}

export async function getDecryptedTokensForCompany(params: { companyId: string }): Promise<
  | { ok: true; accessToken: string; refreshToken: string; expiresAt: string | null; status: ShaamConnectionStatus }
  | { ok: false; status: ShaamConnectionStatus | "missing"; message: string }
> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from("company_shaam_connections")
    .select("access_token, refresh_token, expires_at, status")
    .eq("company_id", params.companyId)
    .eq("env", getShaamEnvSafe())
    .maybeSingle()

  if (error) return { ok: false, status: "error", message: "db_error" }
  if (!data) return { ok: false, status: "missing", message: "not_connected" }

  const status = String((data as any).status || "error") as ShaamConnectionStatus
  const atEnc = (data as any).access_token
  const rtEnc = (data as any).refresh_token
  if (!atEnc || !rtEnc) {
    return { ok: false, status, message: "missing_tokens" }
  }

  return {
    ok: true,
    status,
    accessToken: decryptSecret(String(atEnc)),
    refreshToken: decryptSecret(String(rtEnc)),
    expiresAt: (data as any).expires_at ? String((data as any).expires_at) : null,
  }
}

export async function refreshShaamTokenManual(params: { companyId: string; ignoreCooldown?: boolean }): Promise<
  | { ok: true; connected: boolean; status: ShaamConnectionStatus; expires_at: string | null }
  | { ok: false; connected: boolean; status: ShaamConnectionStatus | "missing"; expires_at: string | null; message: string; cooldown_seconds_remaining?: number }
> {
  const cfg = getShaamConfig()
  const admin = createServiceRoleClient()

  const { data: row, error } = await admin
    .from("company_shaam_connections")
    .select("refresh_token, access_token, token_type, issued_at, expires_at, last_refresh_at, status")
    .eq("company_id", params.companyId)
    .eq("env", getShaamEnvSafe())
    .maybeSingle()

  if (error) return { ok: false, connected: false, status: "error", expires_at: null, message: "db_error" }
  if (!row) return { ok: false, connected: false, status: "missing", expires_at: null, message: "not_connected" }

  const status = String((row as any).status || "error") as ShaamConnectionStatus
  const expiresAt = (row as any).expires_at ? String((row as any).expires_at) : null

  // Cooldown (DB-based) — used for manual refresh endpoint and UI button.
  // Phase 2 issuance flow may bypass this by passing ignoreCooldown=true.
  if (!params.ignoreCooldown) {
    const lastRefreshAtIso = (row as any).last_refresh_at ? String((row as any).last_refresh_at) : null
    if (lastRefreshAtIso) {
      const last = new Date(lastRefreshAtIso).getTime()
      if (Number.isFinite(last)) {
        const now = Date.now()
        const cooldownMs = cfg.refreshCooldownSeconds * 1000
        const ageMs = now - last
        if (ageMs >= 0 && ageMs < cooldownMs) {
          const remaining = Math.max(1, Math.ceil((cooldownMs - ageMs) / 1000))
          return {
            ok: false,
            connected: status === "active",
            status,
            expires_at: expiresAt,
            message: "cooldown",
            cooldown_seconds_remaining: remaining,
          }
        }
      }
    }
  }

  const rtEnc = (row as any).refresh_token
  if (!rtEnc) {
    return { ok: false, connected: false, status, expires_at: expiresAt, message: "missing_refresh_token" }
  }

  const refreshToken = decryptSecret(String(rtEnc))

  // ITA token endpoint expects client credentials via HTTP Basic auth, not in the body.
  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", refreshToken)

  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")

  // Cooldown enforcement should apply to attempts too (not only successes).
  const attemptedAt = new Date()
  await admin
    .from("company_shaam_connections")
    .update({ last_refresh_at: attemptedAt.toISOString() })
    .eq("company_id", params.companyId)
    .eq("env", getShaamEnvSafe())

  const dispatcher = getShaamDispatcher()

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      authorization: `Basic ${basicAuth}`,
    },
    body,
    cache: "no-store",
    ...(dispatcher ? { dispatcher } : {}),
  })

  const json: any = await res.json().catch(() => null)
  if (!res.ok) {
    const safe = safeErrorFromTokenEndpoint({ status: res.status, json })
    const newStatus: ShaamConnectionStatus = res.status === 400 || res.status === 401 ? "expired" : "error"
    await admin
      .from("company_shaam_connections")
      .update({
        status: newStatus,
        last_refresh_at: attemptedAt.toISOString(),
        last_error_code: safe.code,
        last_error_message: safe.message,
      })
      .eq("company_id", params.companyId)
      .eq("env", getShaamEnvSafe())

    await recordShaamEvent({
      companyId: params.companyId,
      eventType: newStatus === "expired" ? "oauth_expired" : "oauth_error",
      payload: { status: newStatus, last_error_code: safe.code, last_error_message: safe.message },
    })

    return { ok: false, connected: false, status: newStatus, expires_at: expiresAt, message: "refresh_failed" }
  }

  const parsed = json as RefreshResponse
  const accessToken = typeof parsed?.access_token === "string" ? parsed.access_token : null
  const expiresIn = typeof parsed?.expires_in === "number" ? parsed.expires_in : null
  if (!accessToken || !expiresIn) {
    await markConnectionError({
      companyId: params.companyId,
      status: "error",
      errorCode: "bad_response",
      errorMessage: "missing_access_token_or_expires_in",
    })
    return { ok: false, connected: false, status: "error", expires_at: expiresAt, message: "bad_response" }
  }

  const issuedAt = attemptedAt
  const newExpiresAt = toExpiresAtIso(issuedAt, expiresIn)

  const refreshTokenNew =
    typeof parsed?.refresh_token === "string" && parsed.refresh_token.trim().length > 0 ? parsed.refresh_token.trim() : null

  await admin
    .from("company_shaam_connections")
    .update({
      access_token: encryptSecret(accessToken),
      refresh_token: refreshTokenNew ? encryptSecret(refreshTokenNew) : (row as any).refresh_token,
      token_type: typeof parsed?.token_type === "string" && parsed.token_type.trim() ? parsed.token_type.trim() : (row as any).token_type || "Bearer",
      issued_at: issuedAt.toISOString(),
      expires_at: newExpiresAt,
      last_refresh_at: issuedAt.toISOString(),
      status: "active",
      revoked_at: null,
      scopes: typeof parsed?.scope === "string" ? parsed.scope : (row as any).scopes ?? null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("company_id", params.companyId)
    .eq("env", getShaamEnvSafe())

  await recordShaamEvent({
    companyId: params.companyId,
    eventType: "oauth_refresh",
    payload: { status: "active", expires_at: newExpiresAt },
  })

  return { ok: true, connected: true, status: "active", expires_at: newExpiresAt }
}

