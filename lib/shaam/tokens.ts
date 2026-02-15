import "server-only"

import { getShaamConfig } from "@/lib/shaam/config"
import { decryptSecret, encryptSecret } from "@/lib/shaam/crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"

export type ShaamConnectionStatus = "active" | "expired" | "revoked" | "error"

type TokenResponse = {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in: number
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
  const payload = params.payload ? JSON.parse(JSON.stringify(params.payload)) : null
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
  const admin = createServiceRoleClient()

  const { data: savedRow } = await admin
    .from("company_shaam_connections")
    .upsert(
      {
        company_id: params.companyId,
        provider: "shaam",
        access_token: encryptSecret(params.token.access_token),
        refresh_token: encryptSecret(params.token.refresh_token),
        token_type: params.token.token_type || "Bearer",
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt,
        connected_at: nowIso(),
        last_refresh_at: null,
        revoked_at: null,
        scopes: params.token.scope || null,
        status: "active",
        last_error_code: null,
        last_error_message: null,
      },
      { onConflict: "company_id" }
    )
    .select("company_id")
    .maybeSingle()

  await recordShaamEvent({
    companyId: params.companyId,
    eventType: "oauth_connected",
    payload: { status: "active", expires_at: expiresAt, scopes: params.token.scope || null },
  })

  return savedRow
}

export async function markConnectionError(params: {
  companyId: string
  status: Exclude<ShaamConnectionStatus, "revoked" | "active">
  errorCode: string
  errorMessage: string
}) {
  const admin = createServiceRoleClient()
  // We must supply expires_at if inserting a new row; if row doesn't exist, we create an \"error\" shell.
  const now = new Date()
  const shellExpiresAt = now.toISOString()

  await admin.from("company_shaam_connections").upsert(
    {
      company_id: params.companyId,
      provider: "shaam",
      expires_at: shellExpiresAt,
      issued_at: shellExpiresAt,
      connected_at: shellExpiresAt,
      status: params.status,
      last_error_code: String(params.errorCode || "").slice(0, 120) || null,
      last_error_message: String(params.errorMessage || "").slice(0, 500) || null,
    },
    { onConflict: "company_id" }
  )

  await recordShaamEvent({
    companyId: params.companyId,
    eventType: params.status === "expired" ? "oauth_expired" : "oauth_error",
    payload: {
      status: params.status,
      last_error_code: String(params.errorCode || "").slice(0, 120) || null,
      last_error_message: String(params.errorMessage || "").slice(0, 500) || null,
    },
  })
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

  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", refreshToken)
  body.set("client_id", cfg.clientId)
  body.set("client_secret", cfg.clientSecret)

  // Cooldown enforcement should apply to attempts too (not only successes).
  const attemptedAt = new Date()
  await admin
    .from("company_shaam_connections")
    .update({ last_refresh_at: attemptedAt.toISOString() })
    .eq("company_id", params.companyId)

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
    cache: "no-store",
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

  await recordShaamEvent({
    companyId: params.companyId,
    eventType: "oauth_refresh",
    payload: { status: "active", expires_at: newExpiresAt },
  })

  return { ok: true, connected: true, status: "active", expires_at: newExpiresAt }
}

