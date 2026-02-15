export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getShaamConfig } from "@/lib/shaam/config"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"
import { createShaamOauthState } from "@/lib/shaam/state"
import { recordShaamEvent } from "@/lib/shaam/tokens"

function loginRedirectForRequest(req: Request): NextResponse {
  const u = new URL(req.url)
  const host = u.host
  const proto = u.protocol
  // Safari shows a white error page if redirected to https://localhost without local TLS.
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
  let cfg: ReturnType<typeof getShaamConfig>
  try {
    // Validate configuration early (sandbox-only in Phase 1)
    cfg = getShaamConfig()
  } catch (e: any) {
    console.error("[shaam][start] misconfigured", e?.message || e)
    return NextResponse.json({ ok: false, message: "shaam_misconfigured" }, { status: 500 })
  }

  // Request context (useful on Vercel/proxies)
  console.log("[shaam][start] request", {
    url: req.url,
    host: req.headers.get("host"),
    "x-forwarded-host": req.headers.get("x-forwarded-host"),
    "x-forwarded-proto": req.headers.get("x-forwarded-proto"),
    "x-forwarded-for": req.headers.get("x-forwarded-for") ? "[present]" : null,
    "user-agent": req.headers.get("user-agent"),
  })

  // DEBUG (Phase 1): print what we actually send to SHAAM (no secrets)
  console.log("[shaam][start] env=", cfg.env)
  console.log("[shaam][start] authUrl=", cfg.authUrl)
  console.log("[shaam][start] tokenUrl=", cfg.tokenUrl)
  console.log("[shaam][start] baseUrl=", cfg.baseUrl)
  console.log("[shaam][start] clientId=", cfg.clientId ? `${cfg.clientId.slice(0, 6)}…` : "")
  console.log("[shaam][start] scopes=", cfg.scopes)
  console.log("[shaam][start] redirectUri=", cfg.redirectUri)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.log("[shaam][start] no_user -> login_redirect")
    return loginRedirectForRequest(req)
  }

  let companyId: string
  try {
    companyId = await resolveCurrentCompanyId()
  } catch (e: any) {
    console.error("[shaam][start] company_not_found", e?.message || e)
    return NextResponse.json({ ok: false, message: "company_not_found" }, { status: 400 })
  }

  let state: string
  try {
    state = createShaamOauthState({ companyId, userId: user.id })
  } catch (e: any) {
    console.error("[shaam][start] state_failed", e?.message || e)
    return NextResponse.json({ ok: false, message: "state_failed" }, { status: 500 })
  }

  await recordShaamEvent({ companyId, eventType: "oauth_start", payload: { status: "start" } })

  const url = new URL(cfg.authUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", cfg.clientId)
  url.searchParams.set("redirect_uri", cfg.redirectUri)
  url.searchParams.set("scope", cfg.scopes)
  url.searchParams.set("state", state)

  // Do not log state value (contains signed payload), only metadata.
  console.log("[shaam][start] authorize_redirect", {
    origin: url.origin,
    pathname: url.pathname,
    response_type: url.searchParams.get("response_type"),
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    stateLength: state.length,
  })

  return NextResponse.redirect(url)
}
