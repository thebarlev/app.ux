export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getShaamConfig } from "@/lib/shaam/config"
import { verifyShaamOauthState } from "@/lib/shaam/state"
import { markConnectionError, upsertConnectionFromTokenResponse } from "@/lib/shaam/tokens"

function redirectToSettings(url: URL, params: Record<string, string>) {
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
    return NextResponse.json({ ok: false, message: "shaam_misconfigured" }, { status: 500 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // Hard requirement: callback must require authenticated user
    return loginRedirectForRequest(req)
  }

  const url = new URL(req.url)
  const code = url.searchParams.get("code") || ""
  const stateRaw = url.searchParams.get("state") || ""

  if (!code || !stateRaw) {
    return redirectToSettings(url, { error: "1" })
  }

  const ver = verifyShaamOauthState(stateRaw)
  if (!ver.ok) {
    return redirectToSettings(url, { error: "1" })
  }

  // Hard requirement: user_id in state must match authenticated user
  if (ver.payload.user_id !== user.id) {
    return redirectToSettings(url, { error: "1" })
  }

  const companyId = ver.payload.company_id

  const body = new URLSearchParams()
  body.set("grant_type", "authorization_code")
  body.set("code", code)
  body.set("redirect_uri", cfg.redirectUri)
  body.set("client_id", cfg.clientId)
  body.set("client_secret", cfg.clientSecret)

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

  const accessToken = typeof json?.access_token === "string" ? json.access_token : null
  const refreshToken = typeof json?.refresh_token === "string" ? json.refresh_token : null
  const tokenType = typeof json?.token_type === "string" ? json.token_type : "Bearer"
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : null
  const scope = typeof json?.scope === "string" ? json.scope : null

  if (!accessToken || !refreshToken || !expiresIn) {
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

  return redirectToSettings(url, { connected: "1" })
}

