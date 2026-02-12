export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

function requireCronSecret(req: Request) {
  const expected = process.env.BILLING_CRON_SECRET
  if (!expected) throw new Error("Missing BILLING_CRON_SECRET")
  const got = req.headers.get("x-cron-secret")
  if (!got || got !== expected) {
    return false
  }
  return true
}

function parseNameValueResponse(rawText: string): Record<string, any> {
  const text = String(rawText || "").trim()
  if (!text) return {}
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      return JSON.parse(text)
    } catch {
      // ignore
    }
  }
  const params = new URLSearchParams(text.replace(/^\?/, ""))
  const obj: Record<string, any> = {}
  for (const [k, v] of params.entries()) obj[k] = v
  return obj
}

function yyyymmddFromIso(iso: string): string {
  // iso: 2026-02-10T...Z -> 20260210
  const d = new Date(iso)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${yyyy}${mm}${dd}`
}

function calendarMonthRangeYmdForDate(date: Date): { fromDate: string; toDate: string } {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1))
  const to = new Date(Date.UTC(year, month + 1, 0))
  const toYmd = (d: Date) => d.toISOString().slice(0, 10)
  return { fromDate: toYmd(from), toDate: toYmd(to) }
}

function uniqAsmachta(companyId: string, periodStartIso: string): string {
  const compact = String(companyId).replaceAll("-", "")
  const shortId = compact.slice(0, 12) // 12 hex chars
  const ymd = yyyymmddFromIso(periodStartIso)
  // Max 25 chars per Cardcom docs
  return `r:${shortId}:${ymd}`
}

function getCardcomConfig() {
  const terminalNumber = process.env.CARDCOM_TERMINAL_NUMBER
  const apiUsername = process.env.CARDCOM_API_USERNAME
  const apiPassword = process.env.CARDCOM_API_PASSWORD
  const mode = (process.env.CARDCOM_MODE || "prod").toLowerCase() === "test" ? "test" : "prod"

  const missing: string[] = []
  if (!terminalNumber) missing.push("CARDCOM_TERMINAL_NUMBER")
  if (!apiUsername) missing.push("CARDCOM_API_USERNAME")
  if (!apiPassword) missing.push("CARDCOM_API_PASSWORD")
  if (missing.length) throw new Error(`Missing Cardcom env vars: ${missing.join(", ")}`)

  return { terminalNumber, apiUsername, apiPassword, mode }
}

async function chargeToken(args: {
  token: string
  tokenExDate?: string | null
  sumToBill: number
  coinId: number
  uniqAsmachta: string
}) {
  const cfg = getCardcomConfig()
  const url = "https://secure.cardcom.solutions/interface/ChargeToken.aspx"

  const form = new URLSearchParams({
    TerminalNumber: cfg.terminalNumber!,
    UserName: cfg.apiUsername!,
    CodePage: "65001",
    "TokenToCharge.Token": args.token,
    "TokenToCharge.SumToBill": args.sumToBill.toFixed(2),
    "TokenToCharge.CoinID": String(args.coinId),
    "TokenToCharge.APILevel": "10",
    "TokenToCharge.UniqAsmachta": args.uniqAsmachta,
    "TokenToCharge.UserPassword": cfg.apiPassword!,
  } as Record<string, string>)

  if (args.tokenExDate) {
    form.set("TokenToCharge.TokenExDate", args.tokenExDate)
  }

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form,
  })

  const raw = await r.text()
  const parsed = parseNameValueResponse(raw)
  return { raw, parsed }
}

function normalizeCardcomTokenExDate(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim()
  if (!s) return null
  const digits = s.replace(/\D/g, "")

  // 20280201 -> 0228
  if (digits.length === 8) {
    const year = digits.slice(2, 4)
    const month = digits.slice(4, 6)
    if (Number(month) >= 1 && Number(month) <= 12) return `${month}${year}`
  }

  // 202802 -> 0228
  if (digits.length === 6) {
    const year = digits.slice(2, 4)
    const month = digits.slice(4, 6)
    if (Number(month) >= 1 && Number(month) <= 12) return `${month}${year}`
  }

  // MMYYYY -> MMYY
  if (digits.length === 6) {
    const month = digits.slice(0, 2)
    const year = digits.slice(4, 6)
    if (Number(month) >= 1 && Number(month) <= 12) return `${month}${year}`
  }

  // MMYY
  if (digits.length === 4) {
    const month = digits.slice(0, 2)
    if (Number(month) >= 1 && Number(month) <= 12) return digits
  }

  return null
}

export async function POST(req: Request) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
  }

  const admin = createServiceRoleClient()
  const nowIso = new Date().toISOString()

  // Find due subscriptions (paid plans only)
  const { data: subs, error: subsErr } = await admin
    .from("subscriptions")
    .select(
      "company_id, plan_id, status, billing_interval, current_period_start, current_period_end, " +
      "plan_snapshot_price, plan_snapshot_documents_limit, plan_snapshot_overage_unit_price, plan_snapshot_billing_period"
    )
    .neq("plan_id", "free")
    .not("current_period_end", "is", null)
    .lte("current_period_end", nowIso)

  if (subsErr) {
    return NextResponse.json({ ok: false, message: "Failed to list subscriptions", error: subsErr }, { status: 500 })
  }

  const results: any[] = []

  for (const sub of subs || []) {
    const companyId = String((sub as any).company_id || "")
    const planId = String((sub as any).plan_id || "")
    const periodStartIso = (sub as any).current_period_start ? String((sub as any).current_period_start) : null
    const periodEndIso = (sub as any).current_period_end ? String((sub as any).current_period_end) : null

    if (!companyId || !planId || !periodStartIso || !periodEndIso) continue

    // Idempotency: if renewal already succeeded for this (company, period_start), skip.
    const { data: existingEv } = await admin
      .from("billing_renewal_events")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("period_start", periodStartIso)
      .maybeSingle()

    if ((existingEv as any)?.status === "succeeded") {
      results.push({ company_id: companyId, period_start: periodStartIso, skipped: true, reason: "already_succeeded" })
      continue
    }

    // Billing math MUST use frozen subscription snapshot values only.
    const baseAmount = Number((sub as any).plan_snapshot_price ?? 0)
    const included = Number((sub as any).plan_snapshot_documents_limit ?? 0)
    const unit = Number((sub as any).plan_snapshot_overage_unit_price ?? 0)
    const renewalPeriod = String((sub as any).plan_snapshot_billing_period || (sub as any).billing_interval || "month")

    if (
      !Number.isFinite(baseAmount) ||
      !Number.isFinite(included) ||
      !Number.isFinite(unit) ||
      (renewalPeriod !== "month" && renewalPeriod !== "year")
    ) {
      results.push({ company_id: companyId, period_start: periodStartIso, ok: false, reason: "snapshot_missing" })
      continue
    }

    // Count ALL finalized docs in the billing month (by issue_date, all document types).
    // We anchor the month to the ended cycle so overages are billed on the NEXT renewal charge.
    const periodEndDate = new Date(periodEndIso)
    const monthAnchor =
      Number.isFinite(periodEndDate.getTime()) && periodEndDate.getTime() > 0
        ? new Date(periodEndDate.getTime() - 1)
        : new Date(nowIso)
    const { fromDate, toDate } = calendarMonthRangeYmdForDate(monthAnchor)
    const { count: usedCount, error: countErr } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("document_status", "final")
      .gte("issue_date", fromDate)
      .lte("issue_date", toDate)

    if (countErr) {
      results.push({ company_id: companyId, period_start: periodStartIso, ok: false, reason: "count_failed" })
      continue
    }

    const used = Number(usedCount || 0) || 0
    const overageUnits = Math.max(0, used - included)
    const totalAmount = Number((baseAmount + overageUnits * unit).toFixed(2))

    const uniq = uniqAsmachta(companyId, periodStartIso)

    // Ensure event row exists (idempotent upsert)
    await admin.from("billing_renewal_events").upsert(
      {
        company_id: companyId,
        plan_id: planId,
        period_start: periodStartIso,
        period_end: periodEndIso,
        base_amount: baseAmount,
        overage_units: overageUnits,
        overage_unit_price: unit,
        total_amount: totalAmount,
        uniq_asmachta: uniq,
        status: "created",
        created_at: nowIso,
      } as any,
      { onConflict: "company_id,period_start" }
    )

    // Token: latest active
    const { data: tokenRow } = await admin
      .from("customer_payment_methods")
      .select("token, token_ex_date")
      .eq("company_id", companyId)
      .eq("provider", "cardcom")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const token = tokenRow?.token ? String(tokenRow.token) : null
    const tokenExDate = normalizeCardcomTokenExDate((tokenRow as any)?.token_ex_date ?? null)
    if (!token) {
      await admin
        .from("billing_renewal_events")
        .update({ status: "failed", error_message: "missing_token", processed_at: nowIso })
        .eq("company_id", companyId)
        .eq("period_start", periodStartIso)

      await admin.from("subscriptions").update({ status: "past_due" }).eq("company_id", companyId)

      results.push({ company_id: companyId, period_start: periodStartIso, ok: false, reason: "missing_token" })
      continue
    }

    // Charge Cardcom token
    let charge: any = null
    try {
      charge = await chargeToken({ token, tokenExDate, sumToBill: totalAmount, coinId: 1, uniqAsmachta: uniq })
    } catch (e: any) {
      await admin
        .from("billing_renewal_events")
        .update({ status: "failed", error_message: "charge_request_failed", processed_at: nowIso })
        .eq("company_id", companyId)
        .eq("period_start", periodStartIso)
      await admin.from("subscriptions").update({ status: "past_due" }).eq("company_id", companyId)
      results.push({ company_id: companyId, period_start: periodStartIso, ok: false, reason: "charge_request_failed" })
      continue
    }

    const responseCode = String((charge?.parsed as any)?.ResponseCode ?? "")
    const internalDealNumber = String((charge?.parsed as any)?.InternalDealNumber ?? "").trim() || null

    if (responseCode !== "0") {
      await admin
        .from("billing_renewal_events")
        .update({
          status: "failed",
          error_message: String((charge?.parsed as any)?.Description || "charge_failed"),
          processed_at: nowIso,
        })
        .eq("company_id", companyId)
        .eq("period_start", periodStartIso)

      await admin.from("subscriptions").update({ status: "past_due" }).eq("company_id", companyId)

      results.push({ company_id: companyId, period_start: periodStartIso, ok: false, reason: "charge_failed" })
      continue
    }

    // Success: advance subscription period using frozen subscription billing cadence.
    const newStartIso = nowIso
    const end = new Date()
    if (renewalPeriod === "year") {
      end.setUTCFullYear(end.getUTCFullYear() + 1)
    } else {
      end.setUTCMonth(end.getUTCMonth() + 1)
    }
    const newEndIso = end.toISOString()

    await admin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: newStartIso,
        current_period_end: newEndIso,
      })
      .eq("company_id", companyId)

    // Issue VOW invoice/receipt (service role RPC; implemented next)
    const issuerCompanyId = process.env.VOW_BILLING_COMPANY_ID
    if (issuerCompanyId) {
      const { data: issued, error: issueErr } = await admin.rpc("issue_renewal_invoice_receipt_service", {
        p_company_id: companyId,
        p_period_start: periodStartIso,
        p_issuer_company_id: issuerCompanyId,
      } as any)

      if (issueErr) {
        // Keep renewal succeeded, but log issuance error
        console.error("[RENEWALS_RUN] issue_renewal_invoice_receipt_service failed", { companyId, error: issueErr })
      } else {
        const row = Array.isArray(issued) ? issued[0] : (issued as any)
        if (row?.document_id) {
          await admin
            .from("billing_renewal_events")
            .update({ issued_document_id: String(row.document_id) })
            .eq("company_id", companyId)
            .eq("period_start", periodStartIso)
        }
      }
    }

    await admin
      .from("billing_renewal_events")
      .update({
        status: "succeeded",
        internal_deal_number: internalDealNumber,
        processed_at: nowIso,
      })
      .eq("company_id", companyId)
      .eq("period_start", periodStartIso)

    results.push({
      company_id: companyId,
      period_start: periodStartIso,
      ok: true,
      used,
      included,
      overage_units: overageUnits,
      total_amount: totalAmount,
    })
  }

  return NextResponse.json({ ok: true, now: nowIso, processed: results.length, results })
}

