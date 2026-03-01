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

  AUDITOR_BILLING_ACCOUNT_ID: z.string().uuid().optional().default("4ae68334-15a0-4fa3-a9ba-fd77deccc95d"),
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

  if (!cached.cardcom.terminalNumber || !cached.cardcom.apiUsername || !cached.cardcom.apiPassword) {
    throw new Error(
      isProd
        ? "Missing auditor Cardcom configuration (AUDITOR_CARDCOM_TERMINAL_NUMBER / AUDITOR_CARDCOM_API_USERNAME / AUDITOR_CARDCOM_API_PASSWORD)"
        : "Missing Cardcom configuration (set AUDITOR_CARDCOM_* or CARDCOM_*)"
    )
  }

  if (!cached.tokenEncryptionKeyB64) {
    throw new Error(
      isProd
        ? "Missing auditor token encryption key (AUDITOR_TOKEN_ENCRYPTION_KEY)"
        : "Missing token encryption key (set AUDITOR_TOKEN_ENCRYPTION_KEY or ENCRYPTION_KEY)"
    )
  }

  return cached
}

