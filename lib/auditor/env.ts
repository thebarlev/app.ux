import { z } from "zod"

export type AuditorConfig = {
  enabled: boolean
  betaEmails: string[]
  adminEmail: string | null
  dailyScanLimit: number
  globalDailyLimit: number
  public: boolean
}

function parseEmailList(raw: string): string[] {
  return String(raw || "")
    .split(/[,\n;]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

const envSchema = z.object({
  AUDITOR_ENABLED: z.string().optional().default("false"),
  AUDITOR_BETA_EMAILS: z.string().optional().default(""),
  AUDITOR_ADMIN_EMAIL: z.string().optional().default(""),
  AUDITOR_DAILY_SCAN_LIMIT: z.coerce.number().int().positive().optional().default(30),
  AUDITOR_GLOBAL_DAILY_LIMIT: z.coerce.number().int().positive().optional().default(200),
  AUDITOR_PUBLIC: z.string().optional().default("false"),
})

let cached: AuditorConfig | null = null

export function getAuditorConfig(): AuditorConfig {
  if (cached) return cached

  const parsed = envSchema.parse(process.env)
  cached = {
    enabled: String(parsed.AUDITOR_ENABLED).trim() === "true",
    betaEmails: parseEmailList(parsed.AUDITOR_BETA_EMAILS),
    adminEmail: String(parsed.AUDITOR_ADMIN_EMAIL || "").trim().toLowerCase() || null,
    dailyScanLimit: parsed.AUDITOR_DAILY_SCAN_LIMIT,
    globalDailyLimit: parsed.AUDITOR_GLOBAL_DAILY_LIMIT,
    public: String(parsed.AUDITOR_PUBLIC).trim() === "true",
  }
  return cached
}

export function isAuditorAllowedEmail(email: string | null | undefined): boolean {
  const cfg = getAuditorConfig()
  const e = String(email || "").trim().toLowerCase()
  if (!e) return false
  return cfg.betaEmails.includes(e) || (cfg.adminEmail ? cfg.adminEmail === e : false)
}

