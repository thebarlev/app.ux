import "server-only"

export type ShaamEnv = "sandbox"

export type ShaamConfig = {
  env: ShaamEnv
  baseUrl: string
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: string
  redirectUri: string
  refreshCooldownSeconds: number
}

const SANDBOX = {
  baseUrl: "https://openapi.taxes.gov.il/shaam/tsandbox",
  authUrl: "https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/authorize",
  tokenUrl: "https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/token",
} as const


function req(name: string): string {
  const v = process.env[name]
  if (!v || !String(v).trim()) throw new Error(`Missing ${name}`)
  return String(v).trim()
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "")
}

function parseCooldownSeconds(input: string | undefined): number {
  const n = input ? Number(input) : NaN
  if (!Number.isFinite(n) || n <= 0) return 60
  // Avoid absurd values causing UX dead-ends.
  return Math.min(60 * 60, Math.floor(n))
}

export function getShaamConfig(): ShaamConfig {
  const envRaw = (process.env.SHAAM_ENV || "").trim().toLowerCase()
  if (envRaw !== "sandbox") {
    throw new Error("SHAAM_ENV must be sandbox in Phase 1")
  }

  // Required for OAuth anti-CSRF state signing/verification.
  // (We validate here so /oauth/start fails with a clear configuration error.)
  req("SHAAM_OAUTH_STATE_SECRET")

  const baseUrl = normalizeBaseUrl(req("SHAAM_BASE_URL"))
  const authUrl = req("SHAAM_AUTH_URL")
  const tokenUrl = req("SHAAM_TOKEN_URL")

  // Phase 1 hard-guard: sandbox endpoints only.
  if (baseUrl !== SANDBOX.baseUrl) throw new Error("SHAAM_BASE_URL must be SANDBOX in Phase 1")
  if (authUrl !== SANDBOX.authUrl) throw new Error("SHAAM_AUTH_URL must be SANDBOX in Phase 1")
  if (tokenUrl !== SANDBOX.tokenUrl) throw new Error("SHAAM_TOKEN_URL must be SANDBOX in Phase 1")

  // Allow SHAAM redirect base to be configured separately from other systems (e.g., Cardcom).
  // If omitted, fall back to PUBLIC_BASE_URL.
  const shaamPublicBaseUrl = (process.env.SHAAM_PUBLIC_BASE_URL || "").trim()
  const publicBaseUrl = normalizeBaseUrl(shaamPublicBaseUrl ? shaamPublicBaseUrl : req("PUBLIC_BASE_URL"))
  const redirectUri = `${publicBaseUrl}/api/shaam/oauth/callback`

  return {
    env: "sandbox",
    baseUrl,
    authUrl,
    tokenUrl,
    clientId: req("SHAAM_CLIENT_ID"),
    clientSecret: req("SHAAM_CLIENT_SECRET"),
    scopes: req("SHAAM_SCOPES"),
    redirectUri,
    refreshCooldownSeconds: parseCooldownSeconds(process.env.SHAAM_REFRESH_COOLDOWN_SECONDS),
  }
}

