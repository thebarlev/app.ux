import type { SupabaseClient } from "@supabase/supabase-js"
import { renderAuditorReportEmail, type AuditorReportEmailData } from "./email-template"
import { sendBrevoEmail } from "@/lib/email/brevo"

/**
 * The pass that mails finished reports.
 *
 * Deliberately a plain function rather than a route: it takes a client and a
 * budget and returns a tally, so whatever ends up hosting it — the existing
 * worker tick, a route of its own — is a wiring decision made elsewhere.
 *
 * It never touches finalizeScan or the pipeline. A scan reaching status='done'
 * with a score is the only signal it reads, and the only thing it writes is
 * report_email_sent_at on rows it has actually mailed.
 */

/** The flag is the send switch, and it is off. Everything else still runs. */
function sendingEnabled(): boolean {
  return String(process.env.AUDITOR_REPORT_EMAIL_ENABLED || "").trim() === "true"
}

function baseUrl(): string {
  return String(process.env.PUBLIC_BASE_URL || "https://app.uxellent.com").replace(/\/+$/, "")
}

export type ReportEmailPassResult = {
  /** Rows the query returned. */
  considered: number
  /** Sends Brevo accepted, and rows stamped. Always 0 while the flag is off. */
  sent: number
  /** Rows deliberately passed over, by reason. */
  skipped: Record<string, number>
  /** Sends that were attempted and failed. The row is left unstamped. */
  failed: number
}

type ScanRow = {
  id: string
  score_total: number | null
  report_public: any
  normalized_host: string | null
  scan_access_token: string | null
  finished_at: string | null
  lead_id: string | null
}

type LeadRow = {
  id: string
  email: string | null
  consent_contact: boolean | null
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1
}

/** Shape a scan row into what the template needs, dropping anything unproven. */
function toEmailData(scan: ScanRow, locale: "he" | "en"): AuditorReportEmailData {
  const rp = scan.report_public && typeof scan.report_public === "object" ? scan.report_public : {}

  const findingsRaw =
    locale === "en" && Array.isArray(rp.issues_overview_en) && rp.issues_overview_en.length > 0
      ? rp.issues_overview_en
      : Array.isArray(rp.issues_overview)
        ? rp.issues_overview
        : []

  // The template shows a handful and says how many more there are; the count is
  // the real total, which issues_overview is already a capped view of.
  const findings = findingsRaw.map((x: unknown) => String(x)).filter(Boolean).slice(0, 5)
  const findingsCount = Array.isArray(rp.issues_overview) ? rp.issues_overview.length : findings.length

  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

  const reportUrl =
    scan.scan_access_token && scan.id
      ? `${baseUrl()}/auditor?scanId=${encodeURIComponent(scan.id)}&token=${encodeURIComponent(scan.scan_access_token)}`
      : null

  return {
    hostname: scan.normalized_host,
    scoreTotal: num(scan.score_total),
    scoreSearch: num(rp.score_search),
    scoreAi: num(rp.score_ai),
    categoryScores: rp.category_scores && typeof rp.category_scores === "object" ? rp.category_scores : null,
    findings,
    findingsCount,
    // Not carried on the scan row, and not worth a join for a number the email
    // can simply omit — the template drops the tile when it is null.
    pagesScanned: null,
    reportUrl,
    locale,
  }
}

export async function runReportEmailPass(params: {
  supabase: SupabaseClient
  /** How long to keep claiming rows. Small by default: this shares a tick. */
  budgetMs?: number
  /** Rows per pass, so one run cannot fan out unboundedly. */
  limit?: number
  locale?: "he" | "en"
}): Promise<ReportEmailPassResult> {
  const { supabase } = params
  const budgetMs = params.budgetMs ?? 8_000
  const limit = params.limit ?? 10
  const locale = params.locale ?? "he"
  const startedAt = Date.now()

  const result: ReportEmailPassResult = { considered: 0, sent: 0, skipped: {}, failed: 0 }

  const { data: scans, error } = await supabase
    .from("auditor_scans")
    .select("id,score_total,report_public,normalized_host,scan_access_token,finished_at,lead_id")
    .eq("status", "done")
    .is("report_email_sent_at", null)
    .order("finished_at", { ascending: true })
    .limit(limit)

  if (error) {
    console.error("[AUDITOR_REPORT_EMAIL] query failed", { error: error.message })
    return result
  }

  const rows = (Array.isArray(scans) ? scans : []) as ScanRow[]
  result.considered = rows.length

  for (const scan of rows) {
    if (Date.now() - startedAt > budgetMs) {
      bump(result.skipped, "budget_exhausted")
      continue
    }

    // Rule 5's counterpart on this side: a done scan without a finite score is
    // not a report, whatever the status column says.
    if (typeof scan.score_total !== "number" || !Number.isFinite(scan.score_total)) {
      bump(result.skipped, "no_score")
      continue
    }

    if (!scan.lead_id) {
      bump(result.skipped, "no_lead")
      continue
    }

    const { data: leadRaw } = await supabase
      .from("auditor_leads")
      .select("id,email,consent_contact")
      .eq("id", scan.lead_id)
      .maybeSingle()

    const lead = leadRaw as LeadRow | null
    if (!lead?.email) {
      bump(result.skipped, "no_email")
      continue
    }

    /*
     * The consent gate, and the reason this worker exists at all.
     *
     * Marketing consent buys the emailed copy and nothing else — the on-screen
     * report opens for anyone who left details. So an unticked box is not a
     * failure to handle later, it is a decision: this scan is never mailed.
     * Skipped rows stay unstamped, which means they are re-read every pass;
     * that is cheap and keeps the column meaning exactly "we mailed this".
     */
    if (lead.consent_contact !== true) {
      bump(result.skipped, "no_consent")
      continue
    }

    const data = toEmailData(scan, locale)
    const { subject, html } = renderAuditorReportEmail(data)

    if (!sendingEnabled()) {
      /*
       * Dry run — and specifically, a dry run that does NOT stamp.
       *
       * Stamping here would be the worst possible outcome: every eligible scan
       * marked as mailed while the flag is off, and none of them ever mailed
       * once it is turned on. The row must stay claimable.
       */
      bump(result.skipped, "sending_disabled")
      console.info("[AUDITOR_REPORT_EMAIL] dry run — not sent", {
        scanId: scan.id,
        subjectLength: subject.length,
        htmlBytes: html.length,
        findings: data.findings.length,
        hasReportUrl: Boolean(data.reportUrl),
      })
      continue
    }

    const send = await sendBrevoEmail({
      to: [lead.email],
      subject,
      html,
      senderName: "Uxellent",
      label: `auditor-report:${scan.id}`,
    })

    if (!send.sent) {
      // Left unstamped on purpose: an unsent report should be retried, and the
      // column's only meaning is "this was delivered to the transport".
      result.failed += 1
      console.error("[AUDITOR_REPORT_EMAIL] send failed", { scanId: scan.id, reason: send.reason })
      continue
    }

    /*
     * Stamp after the send, guarded on the column still being null.
     *
     * Ordering is a real trade. Claiming first would guarantee no duplicate but
     * would silently drop a report whenever a send failed after the claim.
     * Stamping after means a crash between send and stamp re-sends once on the
     * next pass. A duplicate report is an annoyance; a promised report that
     * never arrives is a broken promise, so the duplicate is the better failure.
     * The .is() guard keeps two overlapping passes from both stamping.
     */
    const { error: stampError } = await supabase
      .from("auditor_scans")
      .update({ report_email_sent_at: new Date().toISOString() })
      .eq("id", scan.id)
      .is("report_email_sent_at", null)

    if (stampError) {
      console.error("[AUDITOR_REPORT_EMAIL] sent but stamp failed", { scanId: scan.id, error: stampError.message })
    }

    result.sent += 1
  }

  return result
}
