export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

function requireCronSecret(req: Request) {
  const expected = process.env.BILLING_CRON_SECRET
  if (!expected) throw new Error("Missing BILLING_CRON_SECRET")
  const got = req.headers.get("x-cron-secret")
  return !!got && got === expected
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export async function POST(req: Request) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
  }

  const issuerCompanyId = String(process.env.VOW_BILLING_COMPANY_ID || "").trim()
  if (!issuerCompanyId) {
    return NextResponse.json(
      { ok: false, message: "Missing VOW_BILLING_COMPANY_ID" },
      { status: 500 }
    )
  }

  const url = new URL(req.url)
  const limit = clampInt(Number(url.searchParams.get("limit") || "50"), 1, 200)

  const admin = createServiceRoleClient()

  // Fetch recent paid sessions, then filter out those already linked in billing_documents.
  const { data: sessions, error: sessionsErr } = await admin
    .from("checkout_sessions")
    .select("id, company_id, plan_id, amount, coin_id, provider_low_profile_code, provider_internal_deal_number, created_at")
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (sessionsErr) {
    return NextResponse.json({ ok: false, message: "Failed to list paid sessions", error: sessionsErr }, { status: 500 })
  }

  const ids = (sessions || []).map((s: any) => String(s.id)).filter(Boolean)
  if (!ids.length) {
    return NextResponse.json({ ok: true, scanned: 0, missing: 0, issued: 0, results: [] })
  }

  const { data: links, error: linksErr } = await admin
    .from("billing_documents")
    .select("checkout_session_id, document_id")
    .in("checkout_session_id", ids)

  if (linksErr) {
    return NextResponse.json({ ok: false, message: "Failed to list billing_documents", error: linksErr }, { status: 500 })
  }

  const linked = new Set((links || []).map((l: any) => String(l.checkout_session_id)))
  const missing = (sessions || []).filter((s: any) => !linked.has(String(s.id)))

  const results: Array<{ checkout_session_id: string; ok: boolean; document_id?: string | null; document_number?: string | null; error?: any }> = []

  for (const s of missing) {
    const checkoutSessionId = String((s as any).id || "")
    if (!checkoutSessionId) continue

    const r = await admin.rpc("issue_paid_checkout_document_service", {
      p_checkout_session_id: checkoutSessionId,
      p_issuer_company_id: issuerCompanyId,
    } as any)

    const row = Array.isArray(r.data) ? (r.data[0] as any) : (r.data as any)
    const ok = row?.ok === true && !!row?.document_id

    if (!ok || r.error) {
      try {
        await admin.from("billing_failures").insert({
          checkout_session_id: checkoutSessionId,
          company_id: String((s as any).company_id || ""),
          failure_stage: "document_issuance_repair",
          error_message: r.error?.message ?? (ok ? null : "issuance_not_ok"),
          error_details: { error: r.error, data: r.data },
        } as any)
      } catch {
        // ignore secondary failures
      }
    }

    results.push({
      checkout_session_id: checkoutSessionId,
      ok,
      document_id: row?.document_id ? String(row.document_id) : null,
      document_number: row?.document_number ? String(row.document_number) : null,
      error: r.error || (ok ? null : row),
    })
  }

  const issued = results.filter((x) => x.ok).length
  return NextResponse.json({
    ok: true,
    scanned: ids.length,
    missing: missing.length,
    issued,
    results,
  })
}

