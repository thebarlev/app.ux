import { z } from "zod"

export type AuditorBillingConfig = {
  cardcom: {
    terminalNumber: string
    apiUsername: string
    apiPassword: string
    mode: "test" | "prod"
  }
  billingAccountId: string
  cronSecret: string | null
  tokenEncryptionKeyB64: string
  publicBaseUrl: string | null
}

const envSchema = z.object({
  AUDITOR_CARDCOM_TERMINAL_NUMBER: z.string().optional().default(""),
  AUDITOR_CARDCOM_API_USERNAME: z.string().optional().default(""),
  AUDITOR_CARDCOM_API_PASSWORD: z.string().optional().default(""),
  AUDITOR_CARDCOM_MODE: z.string().optional().default("prod"),

  /**
   * REQUIRED. No default, deliberately.
   *
   * This value decides WHICH DEALER a tax document is issued under. It used to
   * carry `.optional().default("4ae68334-…")` — the real production company — so a
   * missing variable, a stray space, or anything that failed `.uuid()` resolved
   * silently to the live books. zod's `.default()` does not warn; it substitutes.
   *
   * That made every isolation plan a wish. A Preview pointed at a sandbox company
   * would fall back to the real one the moment the override was absent or
   * malformed, and the only evidence would be an invoice_receipt in the wrong
   * dealer's ledger — immutable, and uncancellable while credit notes are blocked.
   *
   * Required means `envSchema.parse()` throws on line ~40, BEFORE `cached` is
   * assigned, so there is no path that returns a config with a guessed issuer.
   * An app that refuses to start without it is the intended behaviour.
   */
  AUDITOR_BILLING_ACCOUNT_ID: z.string().uuid({
    message:
      "AUDITOR_BILLING_ACCOUNT_ID is required and must be a UUID. There is no default: " +
      "it decides which dealer issues the tax document. Set it per environment.",
  }),
  AUDITOR_BILLING_CRON_SECRET: z.string().optional().default(""),

  AUDITOR_TOKEN_ENCRYPTION_KEY: z.string().optional().default(""),
  PUBLIC_BASE_URL: z.string().optional().default(""),
})

let cached: AuditorBillingConfig | null = null

export function getAuditorBillingConfig(): AuditorBillingConfig {
  if (cached) return cached
  const p = envSchema.parse(process.env)

  const isProd = process.env.NODE_ENV === "production"
  const mode = String(p.AUDITOR_CARDCOM_MODE || "prod").toLowerCase() === "test" ? "test" : "prod"

  const terminalNumber =
    String(p.AUDITOR_CARDCOM_TERMINAL_NUMBER || "").trim() ||
    (!isProd ? String(process.env.CARDCOM_TERMINAL_NUMBER || "").trim() : "")
  const apiUsername =
    String(p.AUDITOR_CARDCOM_API_USERNAME || "").trim() || (!isProd ? String(process.env.CARDCOM_API_USERNAME || "").trim() : "")
  const apiPassword =
    String(p.AUDITOR_CARDCOM_API_PASSWORD || "").trim() || (!isProd ? String(process.env.CARDCOM_API_PASSWORD || "").trim() : "")
  const tokenEncryptionKeyB64 =
    String(p.AUDITOR_TOKEN_ENCRYPTION_KEY || "").trim() || (!isProd ? String(process.env.ENCRYPTION_KEY || "").trim() : "")
  const cronSecret =
    String(p.AUDITOR_BILLING_CRON_SECRET || "").trim() || (!isProd ? String(process.env.BILLING_CRON_SECRET || "").trim() : "")

  // ── Validate BEFORE caching ──────────────────────────────────────────────
  // These two checks used to run AFTER `cached` was assigned. The first call threw,
  // and every call after it hit `if (cached) return cached` at the top and returned
  // a config that had failed validation — without throwing. So the guard on the
  // terminal number, which is the only value that decides which terminal is
  // charged, did not actually hold beyond the first invocation.
  //
  // Validating first means a bad configuration throws on every call, forever, and
  // `cached` only ever holds a config that passed.
  if (!terminalNumber || !apiUsername || !apiPassword) {
    throw new Error(
      isProd
        ? "Missing auditor Cardcom configuration (AUDITOR_CARDCOM_TERMINAL_NUMBER / AUDITOR_CARDCOM_API_USERNAME / AUDITOR_CARDCOM_API_PASSWORD)"
        : "Missing Cardcom configuration (set AUDITOR_CARDCOM_* or CARDCOM_*)"
    )
  }

  if (!tokenEncryptionKeyB64) {
    throw new Error(
      isProd
        ? "Missing auditor token encryption key (AUDITOR_TOKEN_ENCRYPTION_KEY)"
        : "Missing token encryption key (set AUDITOR_TOKEN_ENCRYPTION_KEY or ENCRYPTION_KEY)"
    )
  }

  cached = {
    cardcom: {
      terminalNumber,
      apiUsername,
      apiPassword,
      mode,
    },
    billingAccountId: p.AUDITOR_BILLING_ACCOUNT_ID,
    cronSecret: cronSecret || null,
    tokenEncryptionKeyB64,
    publicBaseUrl: String(p.PUBLIC_BASE_URL || "").trim() || null,
  }

  // ── Say out loud where the money goes and whose books this is ────────────
  // Printed once per process, on the first resolution. The two values that decide
  // the outcome, both visible at boot rather than discovered afterwards:
  //   · the last 4 of the terminal number — which Cardcom terminal is charged
  //   · the first 8 of the issuer company  — whose ledger the document lands in
  //
  // Truncated so neither is a secret in a log. NODE_ENV is NOT used to label the
  // environment: Vercel sets it to "production" on Preview deployments too, so it
  // does not distinguish them. VERCEL_ENV does.
  console.log("[AUDITOR_BILLING] config resolved", {
    vercel_env: process.env.VERCEL_ENV || "unset",
    cardcom_terminal_last4: terminalNumber.slice(-4),
    issuer_company_id_prefix: cached.billingAccountId.slice(0, 8),
    cardcom_mode: mode,
  })

  return cached
}

/**
 * The single source of truth for which dealer issues an auditor document.
 *
 * Every auditor path must call this and nothing else. Before it existed the
 * identity was resolved two different ways: the main path read
 * AUDITOR_BILLING_ACCOUNT_ID, while
 * app/api/admin/auditor/repair-missing-invoices resolved
 * `VOW_BILLING_COMPANY_ID || AUDITOR_BILLING_ACCOUNT_ID` — the opposite
 * precedence. The same charge could therefore be invoiced under two different
 * companies depending on which route handled it.
 *
 * There is no `||` here and no fallback. VOW_BILLING_COMPANY_ID belongs to the
 * invoicing product and has no business deciding an auditor document's owner.
 */
export function getAuditorIssuerCompanyId(): string {
  return getAuditorBillingConfig().billingAccountId
}

