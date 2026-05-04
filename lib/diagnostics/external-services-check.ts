import "server-only"

import { randomUUID } from "crypto"

/**
 * Lightweight diagnostics helpers for the document-creation pipeline
 * (app.uxellent.com → pdf.uxellent.com → dsign.uxellent.com).
 *
 * Goal: when the pipeline fails for an authenticated session-user, we
 * want to know in Vercel logs:
 *   1. WHICH external host the function is actually hitting (so we can
 *      detect a stale env var pointing at vow.co.il, a Vercel preview
 *      URL, or a missing var entirely).
 *   2. WHICH step in the pipeline failed, with a stable correlation id.
 *   3. HOW LONG each step took (timeouts? slow upstream?).
 *
 * Hard rule: no PDF bytes, no base64, no API keys, no service-role
 * key, no full email addresses or any other PII go into these logs.
 */

// ─── attempt id ──────────────────────────────────────────────────────
// Short uuid the API handler generates and threads through the
// pipeline. Lets you grep `[DOC_ISSUE]` lines for a single failed
// request out of a noisy log stream.
export function newAttemptId(): string {
  return randomUUID().slice(0, 8)
}

// ─── url / pii helpers ───────────────────────────────────────────────
export function hostFromUrl(raw: string | undefined | null): string {
  const v = (raw || "").trim()
  if (!v) return "MISSING"
  try {
    return new URL(v).host
  } catch {
    // Best effort if it's not a full URL (e.g. someone set a bare host).
    return v.replace(/^https?:\/\//, "").split("/")[0] || "MISSING"
  }
}

export function shortUserId(userId: string | null | undefined): string {
  const v = String(userId || "")
  return v.length <= 8 ? v : v.slice(-8)
}

export function maskEmail(email: string | null | undefined): string {
  const v = String(email || "").trim()
  if (!v) return ""
  const at = v.indexOf("@")
  if (at < 0) return "xxx@…"
  const head = v.slice(0, Math.min(3, at))
  return `${head}@…`
}

// ─── boot self-check ─────────────────────────────────────────────────
// Logs once per process. Not a security boundary — just a way to make
// the env-var configuration visible in Vercel Functions logs without
// leaking the values themselves.
let bootLogged = false

export function logDocIssueBootOnce(): void {
  if (bootLogged) return
  bootLogged = true

  const pdfHost = hostFromUrl(process.env.PDF_RENDER_URL)
  const dsignHost = hostFromUrl(process.env.SECURE_SIGNATURE_BASE_URL)
  const dsigEnabled = String(process.env.DIGITAL_SIGNATURES_ENABLED || "").toLowerCase()
  const billingCompanyIdPresent = !!String(process.env.VOW_BILLING_COMPANY_ID || "").trim()
  const dsignBypass = String(process.env.SECURE_SIGNATURE_BYPASS || "").toLowerCase() === "true"

  console.log("[DOC_ISSUE_BOOT]", {
    pdf_render_host: pdfHost,
    secure_signature_host: dsignHost,
    digital_signatures_enabled: dsigEnabled || "(unset)",
    secure_signature_bypass: dsignBypass,
    vow_billing_company_id_present: billingCompanyIdPresent,
    pdf_render_token_present: !!String(process.env.PDF_RENDER_TOKEN || "").trim(),
    secure_signature_api_key_present: !!String(process.env.SECURE_SIGNATURE_API_KEY || "").trim(),
    supabase_service_role_present: !!String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    vercel_env: process.env.VERCEL_ENV || "(unset)",
    node_env: process.env.NODE_ENV || "(unset)",
  })
}

// ─── per-request step tracker ────────────────────────────────────────
// Threads through the pipeline so each `[DOC_ISSUE]` log line carries:
//   - the same attempt_id
//   - a duration_ms since the previous step (cumulative timing)
// Step names are free-form strings; the contract with the user is that
// they appear in this order:
//   auth_resolved → draft_inserted → pdf_render_start → pdf_render_ok|failed
//   → sign_request_start → sign_request_ok|failed → upload_start → upload_ok
//   → finalize_start → finalize_ok → done
export class DocIssueTracker {
  readonly attemptId: string
  private readonly t0: number
  private tPrev: number

  constructor(attemptId?: string) {
    this.attemptId = attemptId || newAttemptId()
    this.t0 = Date.now()
    this.tPrev = this.t0
  }

  step(name: string, ctx: Record<string, any> = {}): void {
    const now = Date.now()
    const durationMs = now - this.tPrev
    const totalMs = now - this.t0
    this.tPrev = now
    console.log("[DOC_ISSUE]", {
      attempt_id: this.attemptId,
      step: name,
      duration_ms: durationMs,
      total_ms: totalMs,
      ...ctx,
    })
  }

  /**
   * Log a failure with the same shape as `step()` plus error details.
   * The caller is expected to rethrow (or otherwise propagate); this is
   * just the side-effect logger.
   */
  fail(name: string, err: any, ctx: Record<string, any> = {}): void {
    const now = Date.now()
    const durationMs = now - this.tPrev
    const totalMs = now - this.t0
    // Don't advance tPrev on failure — the caller may retry and want
    // the next step's timing measured from the same anchor.
    const stack =
      typeof err?.stack === "string"
        ? err.stack.split("\n").slice(0, 3).join(" | ")
        : null
    console.error("[DOC_ISSUE]", {
      attempt_id: this.attemptId,
      step: name,
      level: "error",
      duration_ms: durationMs,
      total_ms: totalMs,
      error_message: err?.message ?? String(err ?? ""),
      error_code: err?.code ?? null,
      error_status: err?.status ?? null,
      error_stack_head: stack,
      ...ctx,
    })
  }
}
