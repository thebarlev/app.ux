import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { logSecurityEvent } from "@/lib/security/audit-log"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `issuance-get:${ip}`, limit: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const userClient = await createClient()
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) {
    logSecurityEvent({
      event: "auth_denied",
      outcome: "denied",
      userId: null,
      companyId: null,
      requestId: null,
      ip,
      path: new URL(req.url).pathname,
      meta: { surface: "issuance_get" },
    })
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = await params
  const { data: doc, error } = await userClient
    .from("documents")
    .select("id, company_id, document_status, language, original_issued_at, original_issued_language")
    .eq("id", documentId)
    .single()

  if (error || !doc) {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    documentId: doc.id,
    status: doc.document_status,
    baseLanguage: (doc as any).language || "he",
    originalIssuedAt: (doc as any).original_issued_at || null,
    originalIssuedLanguage: (doc as any).original_issued_language || null,
    originalIssued: !!(doc as any).original_issued_at,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `issuance-post:${ip}`, limit: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const userClient = await createClient()
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) {
    logSecurityEvent({
      event: "auth_denied",
      outcome: "denied",
      userId: null,
      companyId: null,
      requestId: null,
      ip,
      path: new URL(req.url).pathname,
      meta: { surface: "issuance_post" },
    })
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = await params
  const body = await req.json().catch(() => ({} as any))
  const language: "he" | "en" = body?.language === "en" ? "en" : "he"  // Idempotent: mark only if not already issued.
  const nowIso = new Date().toISOString()
  const { data: existing, error: readErr } = await userClient
    .from("documents")
    .select("id, company_id, original_issued_at")
    .eq("id", documentId)
    .single()

  if (readErr || !existing) {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 })
  }

  if ((existing as any).original_issued_at) {
    return NextResponse.json({ ok: true, alreadyIssued: true })
  }

  /*
   * ── ⛔ WHY adminClient, AND WHAT AUTHORISES IT ────────────────────────────
   *
   * The stamp lands on a document that is already issued, so `documents_update` —
   * draft-only from migration 138 — refuses it under the user's identity. The write runs
   * as service role, and the authorisation that service role bypasses is re-established
   * here rather than assumed.
   *
   * ⚠️ The predicate is NOT company equality. `documents_select` deliberately admits a
   * buyer to a billing document that belongs to another company, and this route is
   * reachable for those. Requiring the caller's own company would deny a buyer the
   * issuance stamp on an invoice they are entitled to.
   *
   * The authorisation is the RLS-scoped read above: `existing` came back only because
   * `documents_select` returned it for THIS user. The write is pinned to that row by id
   * AND by the company_id it carried, so service role cannot reach any other row.
   */
  const ownerCompanyId = (existing as any)?.company_id
  if (!ownerCompanyId) {
    console.error("[ISSUANCE] refusing stamp: document has no company_id", { documentId })
    return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
  }

  const adminClient = createAdminClient()
  const { error: updErr } = await adminClient
    .from("documents")
    .update({
      original_issued_at: nowIso,
      original_issued_language: language,
    })
    .eq("id", documentId)
    .eq("company_id", ownerCompanyId)
    .is("original_issued_at", null)

  if (updErr) {
    console.error("[ISSUANCE] update failed", { documentId, error: updErr })
    return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
  }

  // Best-effort audit trail
  try {
    await userClient.from("document_events").insert({
      document_id: existing.id,
      company_id: (existing as any).company_id,
      event_type: "updated",
      ip_address: ip && ip !== "unknown" ? ip : null,
      user_agent: req.headers.get("user-agent") ? String(req.headers.get("user-agent")).slice(0, 512) : null,
      event_data: { kind: "issuance_mark", language },
    } as any)
    logSecurityEvent({
      event: "issuance_mark",
      outcome: "succeeded",
      userId: auth.user.id,
      companyId: (existing as any).company_id || null,
      requestId: null,
      ip,
      path: new URL(req.url).pathname,
      meta: { language },
    })
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, originalIssuedAt: nowIso, originalIssuedLanguage: language })
}
