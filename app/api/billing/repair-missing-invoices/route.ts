/**
 * POST /api/billing/repair-missing-invoices
 *
 * Repair endpoint for the VOW billing path (mioshy → app.ux).
 *
 * Scans recent rows in vow_billing_issued_documents and re-runs
 * issuance / finalisation for any of the following defective states:
 *   1. issued row exists, but the documents row is still 'draft'
 *      (finalize step failed)
 *   2. issued row exists and document is 'final', but accounting_status
 *      is missing/non-paid (legacy partial-fallback rows from before
 *      migration 107)
 *   3. document_url is null (signed-URL refresh)
 *
 * Auth:
 *   Header `x-cron-secret: $BILLING_CRON_SECRET`
 *
 * Query params:
 *   - limit: 1..200 (default 50)
 *   - dry_run: 'true' to report without mutating
 *
 * This endpoint:
 *   - NEVER blocks on a single row's failure — every row is logged to
 *     billing_failures with stage = 'vow_repair_missing_invoice'.
 *   - Is idempotent: the underlying RPC is no-op for already-final docs.
 *   - Returns a structured per-row result so the caller / dashboard
 *     can see exactly what happened.
 */

export const runtime  = "nodejs"
export const dynamic  = "force-dynamic"
export const maxDuration = 300

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { logVowBillingFailure } from "@/lib/billing/vow-billing/log-failure"

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function clampMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Number(Number(n).toFixed(2))
}

type RepairAction =
  | "noop_already_finalized"
  | "finalized_via_rpc"
  | "finalized_via_fallback"
  | "refreshed_url"
  | "skipped_dry_run"
  | "failed"

type RepairResult = {
  vow_row_id:        string
  document_id:       string
  user_id:           string | null
  action:            RepairAction
  prev_status:       string | null
  new_status:        string | null
  accounting_status: string | null
  document_url:      string | null
  error?:            string | null
}

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const expected = process.env.BILLING_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ ok: false, message: "Missing BILLING_CRON_SECRET" }, { status: 500 })
  }
  const got = req.headers.get("x-cron-secret")
  if (!got || got !== expected) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
  }

  const issuerCompanyId = String(process.env.VOW_BILLING_COMPANY_ID || "").trim()
  if (!issuerCompanyId) {
    return NextResponse.json({ ok: false, message: "Missing VOW_BILLING_COMPANY_ID" }, { status: 500 })
  }

  const url     = new URL(req.url)
  const limit   = clampInt(Number(url.searchParams.get("limit") || "50"), 1, 200)
  const dryRun  = url.searchParams.get("dry_run") === "true"

  const admin = createAdminClient()

  // ── Find candidate VOW issued documents ─────────────────────────────────
  // Pull recent rows; we filter the 'broken' ones in JS so we can carry
  // the joined data through without complex SQL.
  const { data: issuedRows, error: issuedErr } = await admin
    .from("vow_billing_issued_documents")
    .select("id, user_id, document_id, amount, vat, document_url, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (issuedErr) {
    return NextResponse.json(
      { ok: false, message: "Failed to list issued documents", error: issuedErr.message },
      { status: 500 }
    )
  }

  const docIds = (issuedRows || [])
    .map(r => String((r as any).document_id || "").trim())
    .filter(Boolean)

  if (!docIds.length) {
    return NextResponse.json({ ok: true, scanned: 0, broken: 0, repaired: 0, results: [] })
  }

  const { data: docRows, error: docErr } = await admin
    .from("documents")
    .select("id, document_status, document_number, accounting_status, paid_amount, outstanding_balance, pdf_storage_key, finalized_at")
    .in("id", docIds)
    .eq("company_id", issuerCompanyId)

  if (docErr) {
    return NextResponse.json(
      { ok: false, message: "Failed to load documents", error: docErr.message },
      { status: 500 }
    )
  }

  const docMap = new Map<string, any>()
  for (const d of docRows || []) docMap.set(String((d as any).id), d)

  // Identify rows that need repair.
  type Candidate = {
    vowRow: any
    doc:    any
    reason: "draft_not_final" | "missing_accounting" | "missing_url"
  }
  const candidates: Candidate[] = []

  for (const r of issuedRows || []) {
    const docId = String((r as any).document_id || "")
    const doc   = docId ? docMap.get(docId) : null
    if (!doc) continue

    const status            = String((doc as any).document_status || "")
    const accountingStatus  = (doc as any).accounting_status as string | null
    const docUrl            = (r as any).document_url as string | null

    if (status !== "final") {
      candidates.push({ vowRow: r, doc, reason: "draft_not_final" })
    } else if (accountingStatus !== "paid") {
      candidates.push({ vowRow: r, doc, reason: "missing_accounting" })
    } else if (!docUrl) {
      candidates.push({ vowRow: r, doc, reason: "missing_url" })
    }
  }

  const results: RepairResult[] = []

  for (const c of candidates) {
    const vowRowId   = String(c.vowRow.id)
    const documentId = String(c.doc.id)
    const userId     = c.vowRow.user_id ? String(c.vowRow.user_id) : null
    const prevStatus = String(c.doc.document_status)

    const baseResult: RepairResult = {
      vow_row_id:        vowRowId,
      document_id:       documentId,
      user_id:           userId,
      action:            "failed",
      prev_status:       prevStatus,
      new_status:        prevStatus,
      accounting_status: c.doc.accounting_status ?? null,
      document_url:      c.vowRow.document_url ?? null,
    }

    if (dryRun) {
      results.push({ ...baseResult, action: "skipped_dry_run" })
      continue
    }

    try {
      // Recompute amounts from the issued row.
      const amount    = clampMoney(Number(c.vowRow.amount || 0))
      const vat       = clampMoney(Number(c.vowRow.vat    || 0))
      const totalPaid = clampMoney(amount + vat)
      const nowIso    = new Date().toISOString()

      // ── Step 1: finalisation (only if not already final) ───────────
      if (prevStatus !== "final") {
        const rpc = await admin.rpc("finalize_document_with_period_guard_service", {
          p_company_id:           issuerCompanyId,
          p_document_id:          documentId,
          p_paid_amount:          totalPaid,
          p_credited_amount:      totalPaid,
          p_outstanding_balance:  0,
          p_accounting_status:    "paid",
          p_now:                  nowIso,
        } as any)

        const row = Array.isArray(rpc.data) ? (rpc.data[0] as any) : (rpc.data as any)
        const ok  = !rpc.error && row?.ok === true

        if (!ok) {
          // Try fallback to ensure we never leave a half-finalized doc.
          const fb = await admin
            .from("documents")
            .update({
              document_status:     "final",
              finalized_at:        nowIso,
              finalized_by:        null,
              paid_amount:         totalPaid,
              credited_amount:     totalPaid,
              outstanding_balance: 0,
              accounting_status:   "paid",
            } as any)
            .eq("id", documentId)
            .eq("company_id", issuerCompanyId)
            .eq("document_status", "draft")
            .select("id")
            .maybeSingle()

          if (fb.error) {
            await logVowBillingFailure({
              stage:        "vow_repair_missing_invoice",
              errorCode:    "repair_finalize_failed",
              errorMessage: fb.error.message,
              errorDetails: { rpc_error: rpc.error?.message ?? null, rpc_reason: row?.reason ?? null },
              documentId,
              userId,
              companyId:    issuerCompanyId,
            })
            results.push({ ...baseResult, action: "failed", error: fb.error.message })
            continue
          }
          baseResult.action = "finalized_via_fallback"
        } else {
          baseResult.action = row?.reason === "already_final" ? "noop_already_finalized" : "finalized_via_rpc"
        }
      } else if (c.reason === "missing_accounting") {
        // Doc is final but accounting fields are stale (legacy rows).
        // Backfill ONLY accounting fields. Do not change immutable
        // document_status / finalized_at.
        const fb = await admin
          .from("documents")
          .update({
            paid_amount:         totalPaid,
            credited_amount:     totalPaid,
            outstanding_balance: 0,
            accounting_status:   "paid",
          } as any)
          .eq("id", documentId)
          .eq("company_id", issuerCompanyId)
          .eq("document_status", "final")
          .select("id")
          .maybeSingle()

        if (fb.error) {
          await logVowBillingFailure({
            stage:        "vow_repair_missing_invoice",
            errorCode:    "repair_backfill_failed",
            errorMessage: fb.error.message,
            documentId,
            userId,
            companyId:    issuerCompanyId,
          })
          results.push({ ...baseResult, action: "failed", error: fb.error.message })
          continue
        }
        baseResult.action = "finalized_via_fallback"
      }

      baseResult.new_status        = "final"
      baseResult.accounting_status = "paid"

      // ── Step 2: refresh signed URL if missing ──────────────────────
      if (!c.vowRow.document_url && c.doc.pdf_storage_key) {
        try {
          const signed = await admin.storage
            .from(SECURE_ASSETS_BUCKET)
            .createSignedUrl(String(c.doc.pdf_storage_key), 60 * 60)
          if (!signed.error && signed.data?.signedUrl) {
            await admin
              .from("vow_billing_issued_documents")
              .update({ document_url: signed.data.signedUrl, status: "issued" } as any)
              .eq("id", vowRowId)
            baseResult.document_url = signed.data.signedUrl
            if (baseResult.action === "noop_already_finalized") baseResult.action = "refreshed_url"
          }
        } catch (e: any) {
          // signed-url failure is non-fatal — finalisation already succeeded
          await logVowBillingFailure({
            stage:        "vow_repair_missing_invoice",
            errorCode:    "signed_url_refresh_failed",
            errorMessage: e?.message || String(e),
            documentId,
            userId,
            companyId:    issuerCompanyId,
          })
        }
      }

      results.push(baseResult)
    } catch (e: any) {
      await logVowBillingFailure({
        stage:        "vow_repair_missing_invoice",
        errorCode:    "repair_threw",
        errorMessage: e?.message || String(e),
        documentId,
        userId,
        companyId:    issuerCompanyId,
      })
      results.push({ ...baseResult, action: "failed", error: e?.message || String(e) })
    }
  }

  const repaired = results.filter(r =>
    r.action === "finalized_via_rpc" ||
    r.action === "finalized_via_fallback" ||
    r.action === "refreshed_url"
  ).length

  return NextResponse.json({
    ok:       true,
    dry_run:  dryRun,
    scanned:  (issuedRows || []).length,
    broken:   candidates.length,
    repaired,
    results,
  })
}
