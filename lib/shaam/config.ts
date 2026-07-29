import "server-only"

export type ShaamEnv = "sandbox" | "production"

export type ShaamConfig = {
  env: ShaamEnv
  /** longtimetoken/oauth2/* */
  oauthBaseUrl: string
  /** Invoices/v2/Approval, InvoiceDecisionApi/v1/* */
  apiBaseUrl: string
  /** invoice-information/v1/* */
  infoBaseUrl: string
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: string
  redirectUri: string
  refreshCooldownSeconds: number
}

/**
 * Endpoint profiles, per the ITA ICD ("מודל חשבוניות ישראל — תיאור ה-API's",
 * 29/07/2026, chapters 2 and 4).
 *
 * The ITA splits its services across two hosts, so there is no single base to
 * derive everything from. An earlier version of this file assumed there was and
 * normalised everything onto openapi.taxes.gov.il — which sent the allocation
 * request to a URL that does not exist and broke the sandbox outright.
 *
 * Note the asymmetry on the last line: invoice-information moves to openapi in
 * production while the other API calls stay on ita-api. That is what the ICD
 * specifies; it is not a typo.
 */
const PROFILES: Record<ShaamEnv, { oauthBaseUrl: string; apiBaseUrl: string; infoBaseUrl: string }> = {
  sandbox: {
    oauthBaseUrl: "https://openapi.taxes.gov.il/shaam/tsandbox",
    apiBaseUrl: "https://ita-api.taxes.gov.il/shaam/tsandbox",
    infoBaseUrl: "https://ita-api.taxes.gov.il/shaam/tsandbox",
  },
  production: {
    oauthBaseUrl: "https://openapi.taxes.gov.il/shaam/production",
    apiBaseUrl: "https://ita-api.taxes.gov.il/shaam/production",
    infoBaseUrl: "https://openapi.taxes.gov.il/shaam/production",
  },
}

/** The only hosts the ITA serves any of this from. */
const ALLOWED_HOSTS = ["openapi.taxes.gov.il", "ita-api.taxes.gov.il"]

/** The path segment that identifies the tier, and the real cross-env guard. */
const ENV_PATH_SEGMENT: Record<ShaamEnv, string> = {
  sandbox: "/shaam/tsandbox",
  production: "/shaam/production",
}

const OAUTH_AUTHORIZE_PATH = "/longtimetoken/oauth2/authorize"
const OAUTH_TOKEN_PATH = "/longtimetoken/oauth2/token"

const OAUTH_CALLBACK_PATH = "/api/shaam/oauth/callback"

/** Per-environment credential variable names. Never share a pair across envs. */
const CREDENTIAL_VARS: Record<ShaamEnv, { id: string; secret: string; scopes: string }> = {
  sandbox: {
    id: "SHAAM_CLIENT_ID",
    secret: "SHAAM_CLIENT_SECRET",
    scopes: "SHAAM_SCOPES",
  },
  production: {
    id: "SHAAM_PROD_CLIENT_ID",
    secret: "SHAAM_PROD_CLIENT_SECRET",
    scopes: "SHAAM_PROD_SCOPES",
  },
}

function optionalEnv(name: string): string | null {
  const raw = process.env[name]
  const v = raw == null ? "" : String(raw).trim()
  return v ? v : null
}

function req(name: string): string {
  const v = optionalEnv(name)
  if (!v) throw new Error(`Missing ${name}`)
  return v
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

/**
 * The active SHAAM environment. Does not validate the rest of the configuration
 * — credentials and URLs are checked in getShaamConfig — but it does throw on an
 * SHAAM_ENV value that is neither tier, because there is no safe way to guess
 * which one was meant.
 *
 * Use this where the environment tag is being written: tokens.ts writes it onto
 * the connection row, and a row stored under the wrong tier is worse than a
 * failed write — it is a sandbox token that looks like a production one.
 */
export function getShaamEnv(): ShaamEnv {
  const raw = (process.env.SHAAM_ENV || "sandbox").trim().toLowerCase()
  if (raw === "sandbox") return "sandbox"
  if (raw === "production" || raw === "prod") return "production"
  throw new Error(`SHAAM_ENV must be "sandbox" or "production" (got "${raw}")`)
}

/**
 * Never throws — the counterpart to getShaamEnv above. For reads, logging, and
 * error paths that still have to name a tier while the configuration is broken.
 */
export function getShaamEnvSafe(): ShaamEnv {
  try {
    return getShaamEnv()
  } catch {
    return "sandbox"
  }
}

function assertItaUrl(name: string, url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${name} is not a valid URL`)
  }
  if (parsed.protocol !== "https:") throw new Error(`${name} must be https`)
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error(`${name} must point at one of: ${ALLOWED_HOSTS.join(", ")}`)
  }
  return parsed
}

/**
 * The cross-environment guard.
 *
 * It used to be "the OAuth URL must sit under the API base", which only worked
 * while everything shared one host. Now that the ITA splits across two, the
 * invariant that actually matters is the tier segment in the path: every URL we
 * touch must name the same tier, so a sandbox token can never be spent against
 * a production service or the reverse.
 */
function assertEnvSegment(name: string, url: string, env: ShaamEnv): void {
  const expected = ENV_PATH_SEGMENT[env]
  const other = ENV_PATH_SEGMENT[env === "sandbox" ? "production" : "sandbox"]
  const path = new URL(url).pathname
  if (path.includes(other)) {
    throw new Error(`${name} points at ${other} while SHAAM_ENV=${env}`)
  }
  if (!path.startsWith(expected)) {
    throw new Error(`${name} must sit under ${expected} while SHAAM_ENV=${env}`)
  }
}

type ShaamService = "oauth" | "api" | "info"

/**
 * Override variables, per service and per environment.
 *
 * The OAuth pair carries a legacy name. It used to be SHAAM_BASE_URL, from when
 * there was one base for everything — a name that reads like the API base while
 * holding the OAuth host, which is exactly the host that was wrong. The old name
 * is still read so an existing sandbox deployment keeps working, but it warns,
 * because a leftover value in Vercel should be noticed rather than quietly obeyed.
 */
const BASE_URL_VARS: Record<ShaamService, Record<ShaamEnv, { name: string; legacy?: string }>> = {
  oauth: {
    sandbox: { name: "SHAAM_OAUTH_BASE_URL", legacy: "SHAAM_BASE_URL" },
    production: { name: "SHAAM_PROD_OAUTH_BASE_URL", legacy: "SHAAM_PROD_BASE_URL" },
  },
  api: {
    sandbox: { name: "SHAAM_API_BASE_URL" },
    production: { name: "SHAAM_PROD_API_BASE_URL" },
  },
  info: {
    sandbox: { name: "SHAAM_INFO_BASE_URL" },
    production: { name: "SHAAM_PROD_INFO_BASE_URL" },
  },
}

function resolveServiceBaseUrl(service: ShaamService, env: ShaamEnv): string {
  const { name, legacy } = BASE_URL_VARS[service][env]
  const profile = PROFILES[env]
  const fallback =
    service === "oauth" ? profile.oauthBaseUrl : service === "api" ? profile.apiBaseUrl : profile.infoBaseUrl

  let override = optionalEnv(name)
  let sourceVar = name

  if (!override && legacy) {
    const legacyValue = optionalEnv(legacy)
    if (legacyValue) {
      console.warn(
        `[shaam][config] ${legacy} is deprecated and was used for the OAuth base URL; rename it to ${name}`
      )
      override = legacyValue
      sourceVar = legacy
    }
  } else if (override && legacy && optionalEnv(legacy)) {
    console.warn(`[shaam][config] both ${name} and ${legacy} are set; ${name} wins and ${legacy} is ignored`)
  }

  const baseUrl = normalizeBaseUrl(override || fallback)

  assertItaUrl(sourceVar, baseUrl)
  assertEnvSegment(sourceVar, baseUrl, env)

  return baseUrl
}

function resolveRedirectUri(env: ShaamEnv): string {
  // Derived from the public base URL — unchanged from the original behaviour,
  // so an existing working deployment keeps the exact same redirect. A stale
  // SHAAM_REDIRECT_URI is reported rather than silently taking over, because
  // the value registered with the ITA must match this one exactly.
  const publicBase = optionalEnv("SHAAM_PUBLIC_BASE_URL") || req("PUBLIC_BASE_URL")
  const redirectUri = `${normalizeBaseUrl(publicBase)}${OAUTH_CALLBACK_PATH}`

  const declared = optionalEnv("SHAAM_REDIRECT_URI")
  if (declared && declared !== redirectUri) {
    console.warn("[shaam][config] SHAAM_REDIRECT_URI does not match the derived redirect URI; the derived one is used")
  }

  let parsed: URL
  try {
    parsed = new URL(redirectUri)
  } catch {
    throw new Error("SHAAM redirect URI is not a valid URL")
  }
  if (!parsed.pathname.endsWith(OAUTH_CALLBACK_PATH)) {
    throw new Error(`SHAAM redirect URI must end with ${OAUTH_CALLBACK_PATH}`)
  }

  if (env === "production") {
    const host = parsed.hostname
    const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")
    if (parsed.protocol !== "https:" || isLocal) {
      throw new Error("SHAAM redirect URI must be a public https URL when SHAAM_ENV=production")
    }
    if (/ngrok|trycloudflare|loca\.lt/i.test(host)) {
      console.warn("[shaam][config] production redirect URI points at a tunnel host:", host)
    }
  }

  return redirectUri
}

export function getShaamConfig(): ShaamConfig {
  const env = getShaamEnv()

  // Required for OAuth anti-CSRF state signing/verification.
  // (We validate here so /oauth/start fails with a clear configuration error.)
  req("SHAAM_OAUTH_STATE_SECRET")

  const oauthBaseUrl = resolveServiceBaseUrl("oauth", env)
  const apiBaseUrl = resolveServiceBaseUrl("api", env)
  const infoBaseUrl = resolveServiceBaseUrl("info", env)

  const authUrl =
    optionalEnv(env === "production" ? "SHAAM_PROD_AUTH_URL" : "SHAAM_AUTH_URL") ||
    `${oauthBaseUrl}${OAUTH_AUTHORIZE_PATH}`
  const tokenUrl =
    optionalEnv(env === "production" ? "SHAAM_PROD_TOKEN_URL" : "SHAAM_TOKEN_URL") ||
    `${oauthBaseUrl}${OAUTH_TOKEN_PATH}`

  assertItaUrl("SHAAM auth URL", authUrl)
  assertItaUrl("SHAAM token URL", tokenUrl)

  // The old guard required the OAuth URLs to sit under the API base. That is
  // false now that the ITA serves OAuth and the APIs from different hosts, so
  // the check is on the tier segment instead — see assertEnvSegment.
  assertEnvSegment("SHAAM auth URL", authUrl, env)
  assertEnvSegment("SHAAM token URL", tokenUrl, env)

  const vars = CREDENTIAL_VARS[env]
  // Required per environment, never borrowed from the other one. Sandbox is
  // unaffected — CREDENTIAL_VARS.sandbox.scopes is SHAAM_SCOPES — while
  // production now fails loudly if SHAAM_PROD_SCOPES is missing instead of
  // quietly authorising with the sandbox scope. Same rule resolveBaseUrl uses.
  const scopes = req(vars.scopes)

  return {
    env,
    oauthBaseUrl,
    apiBaseUrl,
    infoBaseUrl,
    authUrl,
    tokenUrl,
    clientId: req(vars.id),
    clientSecret: req(vars.secret),
    scopes,
    redirectUri: resolveRedirectUri(env),
    refreshCooldownSeconds: parseCooldownSeconds(process.env.SHAAM_REFRESH_COOLDOWN_SECONDS),
  }
}
