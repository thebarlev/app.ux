export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { Agent } from "undici"
import { createClient } from "@/lib/supabase/server"
import { getShaamConfig } from "@/lib/shaam/config"
import { verifyShaamOauthState } from "@/lib/shaam/state"
import { markConnectionError, upsertConnectionFromTokenResponse } from "@/lib/shaam/tokens"

function redactTokenLikeFields(input: any): any {
  if (!input || typeof input !== "object") return input
  if (Array.isArray(input)) return input.map(redactTokenLikeFields)
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(input as Record<string, any>)) {
    const key = String(k).toLowerCase()
    if (key === "access_token" || key === "refresh_token" || key === "id_token" || key === "token") {
      out[k] = "[REDACTED]"
    } else {
      out[k] = redactTokenLikeFields(v)
    }
  }
  return out
}

function sanitizeResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of headers.entries()) {
    const key = String(k).toLowerCase()
    if (key === "set-cookie") continue
    out[k] = v
  }
  return out
}

function redirectToSettings(url: URL, params: Record<string, string>) {
  // Always prefer the callback origin to avoid cross-domain session/cookie issues.
  const target = new URL("/dashboard/settings/integrations/shaam", url.origin)
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
  return NextResponse.redirect(target)
}

function loginRedirectForRequest(req: Request): NextResponse {
  const u = new URL(req.url)
  const host = u.host
  const proto = u.protocol
  if ((host.startsWith("localhost:") || host.startsWith("127.0.0.1:")) && proto === "https:") {
    const httpUrl = new URL(req.url)
    httpUrl.protocol = "http:"
    httpUrl.pathname = "/login"
    httpUrl.search = ""
    return NextResponse.redirect(httpUrl)
  }
  return NextResponse.redirect(new URL("/login", req.url))
}

export async function GET(req: Request) {
  // Validate configuration early (sandbox-only in Phase 1)
  let cfg: ReturnType<typeof getShaamConfig>
  try {
    cfg = getShaamConfig()
  } catch (e: any) {
    console.error("[shaam][callback] Config error:", e.message)
    const url = new URL(req.url)
    return redirectToSettings(url, { error: "shaam_misconfigured" })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.log("[shaam][callback] No authenticated user")
    return loginRedirectForRequest(req)
  }

  const url = new URL(req.url)
  const code = url.searchParams.get("code") || ""
  const stateRaw = url.searchParams.get("state") || ""

  if (!code || !stateRaw) {
    console.error("[shaam][callback] Missing code or state")
    return redirectToSettings(url, { error: "1" })
  }

  const ver = verifyShaamOauthState(stateRaw)
  if (!ver.ok) {
    console.error("[shaam][callback] Invalid state signature")
    return redirectToSettings(url, { error: "1" })
  }

  // Hard requirement: user_id in state must match authenticated user
  if (ver.payload.user_id !== user.id) {
    console.error("[shaam][callback] User ID mismatch")
    return redirectToSettings(url, { error: "1" })
  }

  const companyId = ver.payload.company_id

  const body = new URLSearchParams()
  body.set("grant_type", "authorization_code")
  body.set("code", code)
  body.set("redirect_uri", cfg.redirectUri)
  body.set("client_id", cfg.clientId)
  body.set("client_secret", cfg.clientSecret)

  console.log("[shaam][callback] Token request params:", {
    tokenUrl: cfg.tokenUrl,
    redirectUri: cfg.redirectUri,
    clientId: cfg.clientId,
    codeLength: code.length,
    grantType: "authorization_code",
  })

  // Force IPv4 (common fix for connect timeouts to some government domains)
  const dispatcher = new Agent({ connect: { family: 4 } })

  let res: Response
  let json: any = null

  try {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      cache: "no-store",
      // @ts-expect-error - undici extension supported in Node runtime
      dispatcher,
      signal: AbortSignal.timeout(20_000),
    })

    json = await res.json().catch(() => null)
  } catch (e: any) {
    console.error("[shaam][callback] Fetch error:", {
      message: e?.message,
      code: e?.code,
      cause: e?.cause,
    })
    await markConnectionError({
      companyId,
      status: "error",
      errorCode: "token_fetch_failed",
      errorMessage: e?.cause?.code || e?.code || e?.message || "fetch_failed",
    })
    return redirectToSettings(url, { error: "token_fetch_failed" })
  }

  if (!res.ok) {
    console.error("[shaam][callback] Token request failed:", {
      status: res.status,
      statusText: res.statusText,
      responseBody: redactTokenLikeFields(json),
      headers: sanitizeResponseHeaders(res.headers),
    })

    const errorCode = typeof json?.error === "string" ? json.error : `http_${res.status}`
    const errorMessage =
      typeof json?.error_description === "string"
        ? json.error_description
        : typeof json?.message === "string"
          ? json.message
          : "shaam_oauth_failed"

    await markConnectionError({
      companyId,
      status: "error",
      errorCode,
      errorMessage,
    })

    return redirectToSettings(url, { error: "1" })
  }

  console.log("[shaam][callback] Token response received successfully")

  const accessToken = typeof json?.access_token === "string" ? json.access_token : null
  const refreshToken = typeof json?.refresh_token === "string" ? json.refresh_token : null
  const tokenType = typeof json?.token_type === "string" ? json.token_type : "Bearer"
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : null
  const scope = typeof json?.scope === "string" ? json.scope : null

  if (!accessToken || !refreshToken || !expiresIn) {
    console.error("[shaam][callback] Missing required token fields")
    await markConnectionError({
      companyId,
      status: "error",
      errorCode: "bad_response",
      errorMessage: "missing_access_token_refresh_token_or_expires_in",
    })
    return redirectToSettings(url, { error: "1" })
  }

  await upsertConnectionFromTokenResponse({
    companyId,
    token: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenType,
      expires_in: expiresIn,
      scope: scope || undefined,
    },
  })

  console.log("[shaam][callback] Connection saved successfully")
  return redirectToSettings(url, { connected: "1" })
}