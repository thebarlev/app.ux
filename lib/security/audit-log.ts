import "server-only"

export type SecurityEvent = {
  event:
    | "auth_denied"
    | "admin_denied"
    | "pdf_download"
    | "issuance_mark"
    | "signing_failed"
  outcome: "allowed" | "denied" | "failed" | "succeeded"
  userId?: string | null
  companyId?: string | null
  requestId?: string | null
  ip?: string | null
  path?: string | null
  meta?: Record<string, unknown>
}

/**
 * Minimal structured security logging.
 * - Never log secrets/tokens/base64
 * - Prefer IDs + high-level failure codes only
 */
export function logSecurityEvent(e: SecurityEvent) {
  const payload = {
    ts: new Date().toISOString(),
    ...e,
  }
  // Intentionally single-line JSON for log aggregation.
  console.log("[SECURITY_EVENT]", JSON.stringify(payload))
}

