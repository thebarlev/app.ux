export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCompanyIdForUser } from "@/lib/document-helpers"
import { generateDocumentPDF } from "@/lib/pdf-service"
import { changePlanSnapshot } from "@/lib/subscriptions/change-plan"
import fs from "node:fs"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

const AGENT_DEBUG_LOG_PATH = "/Users/uxellent/v0-system-owner-admin-panel/.cursor/debug.log"
function agentAppendLog(payload: any) {
  try {
    fs.appendFileSync(AGENT_DEBUG_LOG_PATH, JSON.stringify(payload) + "\n")
  } catch {
    // ignore
  }
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

function getFirstSearchParam(url: URL, keys: string[]): string | null {
  for (const k of keys) {
    const v = url.searchParams.get(k)
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
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

  return { terminalNumber, apiUsername, mode }
}

function addPeriod(now: Date, interval: "month" | "year"): Date {
  const d = new Date(now.getTime())
  if (interval === "year") {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

function firstNonEmptyString(...vals: Array<any>): string | null {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : ""
    if (s) return s
  }
  return null
}

function extractTokenFromIndicator(indicator: Record<string, any>): {
  token: string
  tokenExDate: string | null
  brand: string | null
  cardNumStart: string | null
  cardNumEnd: string | null
} | null {
  const token = firstNonEmptyString(
    indicator.Token,
    indicator["ExtShvaParams.CardToken"],
    indicator["ExtShvaParams.CardToken_15"],
    indicator["TokenToCharge.Token"]
  )
  if (!token) return null

  const tokenExDate = firstNonEmptyString(indicator.TokenExDate, indicator.Tokef_30, indicator["ExtShvaParams.Tokef30"])
  const brand = firstNonEmptyString(
    indicator.Mutag_24,
    indicator["ExtShvaParams.Mutag24"],
    indicator["Mutag24"],
    indicator["Mutag"]
  )
  const cardNumStart = firstNonEmptyString(indicator.CardNumStart, indicator["ExtShvaParams.FirstCardDigits"])
  const cardNumEnd = firstNonEmptyString(indicator.CardNumEnd, indicator["ExtShvaParams.CardNumber5"])
  return { token, tokenExDate, brand, cardNumStart, cardNumEnd }
}

function normalizeIndicatorForStorage(
  indicator: Record<string, any>,
  tokenInfo: ReturnType<typeof extractTokenFromIndicator>
): Record<string, any> {
  const normalizedLast4 = firstNonEmptyString(
    indicator.CardLast4,
    indicator.CardLastDigits,
    indicator.Last4Digits,
    tokenInfo?.cardNumEnd
  )
  const normalizedBrand = firstNonEmptyString(
    indicator.CardBrand,
    indicator.CardType,
    indicator.CardName,
    tokenInfo?.brand
  )

  return {
    ...indicator,
    CardLast4: normalizedLast4 ?? null,
    CardBrand: normalizedBrand ?? null,
  }
}

export async function GET(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit({ key: `cardcom-confirm:${ip}`, limit: 120, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const userClient = await createClient()
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

  const companyId = await getCompanyIdForUser()

  const url = new URL(req.url)
  const lowProfileCode =
    getFirstSearchParam(url, ["lowprofilecode", "LowProfileCode"]) ||
    getFirstSearchParam(url, ["lowProfileCode"]) ||
    null

  if (!lowProfileCode) {
    return NextResponse.json({ ok: false, message: "Missing lowprofilecode" }, { status: 400 })
  }

  // #region agent log
  agentAppendLog({
    location: "confirm/route.ts:entry",
    message: "Confirm called",
    data: { lowProfileCode, companyId },
    timestamp: Date.now(),
    hypothesisId: "H1",
  })
  // #endregion

  // Pull authoritative indicator from Cardcom
  const cfg = getCardcomConfig()
  const indicatorUrl = "https://secure.cardcom.solutions/Interface/BillGoldGetLowProfileIndicator.aspx"
  const qs = new URLSearchParams()
  qs.set("terminalnumber", String(cfg.terminalNumber || ""))
  qs.set("username", String(cfg.apiUsername || ""))
  qs.set("lowprofilecode", lowProfileCode)
  qs.set("codepage", "65001")

  const r = await fetch(`${indicatorUrl}?${qs.toString()}`, { method: "GET" })
  const indicatorRaw = await r.text()
  const indicator = parseNameValueResponse(indicatorRaw)

  const operationResponse = Number((indicator as any).OperationResponse ?? NaN)
  const internalDealNumber = String((indicator as any).InternalDealNumber ?? "").trim() || null
  const paid = Number.isFinite(operationResponse) && operationResponse === 0
  const tokenInfo = extractTokenFromIndicator(indicator)
  const indicatorForStorage = normalizeIndicatorForStorage(indicator, tokenInfo)

  // #region agent log
  agentAppendLog({
    location: "confirm/route.ts:afterPull",
    message: "Cardcom indicator pulled",
    data: { lowProfileCode, operationResponse, paid, hasToken: !!tokenInfo?.token },
    timestamp: Date.now(),
    hypothesisId: "H5",
  })
  // #endregion

  const adminDb = createServiceRoleClient()

  // Enforce: only allow confirmation for a checkout session belonging to THIS company
  const { data: checkout, error: csErr } = await adminDb
    .from("checkout_sessions")
    .select("id, company_id, plan_id, billing_interval, amount, coin_id, status, provider_low_profile_code")
    .eq("provider_low_profile_code", lowProfileCode)
    .maybeSingle()

  if (csErr || !checkout?.id || String(checkout.company_id) !== String(companyId)) {
    agentAppendLog({
      location: "confirm/route.ts:checkoutMismatch",
      message: "Checkout missing or company mismatch",
      data: { lowProfileCode, companyId, found: !!checkout?.id },
      timestamp: Date.now(),
      hypothesisId: "H2",
    })
    return NextResponse.json({ ok: false, message: "Checkout not found" }, { status: 404 })
  }

  const now = new Date()
  const nowIso = now.toISOString()

  await adminDb
    .from("checkout_sessions")
    .update({
      status: paid ? "paid" : "failed",
      provider_internal_deal_number: internalDealNumber,
      raw_indicator_json: indicatorForStorage,
    })
    .eq("id", String(checkout.id))

  if (!paid) {
    return NextResponse.json({ ok: true, paid: false })
  }

  const interval: "month" | "year" = checkout.billing_interval === "year" ? "year" : "month"
  const endIso = addPeriod(now, interval).toISOString()

  const snapshotUpdate = await changePlanSnapshot({
    supabase: adminDb,
    companyId: String(checkout.company_id),
    newPlanId: String(checkout.plan_id),
    billingPeriod: interval,
    status: "active",
    currentPeriodStart: nowIso,
    currentPeriodEnd: endIso,
  })

  const { error: providerErr } = await adminDb
    .from("subscriptions")
    .update({
      provider: "cardcom",
    })
    .eq("company_id", String(checkout.company_id))

  const subErr = !snapshotUpdate.ok
    ? new Error(snapshotUpdate.message)
    : providerErr

  agentAppendLog({
    location: "confirm/route.ts:subscriptionUpdate",
    message: "Subscription update result",
    data: { checkoutId: checkout.id, companyId: checkout.company_id, planId: checkout.plan_id, subErr: subErr ? String(subErr) : null },
    timestamp: Date.now(),
    hypothesisId: "H4",
  })

  // Token persist (best-effort)
  if (tokenInfo?.token) {
    try {
      await adminDb
        .from("customer_payment_methods")
        .update({ status: "revoked" })
        .eq("company_id", String(checkout.company_id))
        .eq("provider", "cardcom")
        .eq("status", "active")
        .neq("token", tokenInfo.token)

      await adminDb.from("customer_payment_methods").upsert(
        {
          company_id: String(checkout.company_id),
          user_id: null,
          provider: "cardcom",
          token: tokenInfo.token,
          token_ex_date: tokenInfo.tokenExDate,
          brand: tokenInfo.brand,
          card_num_start: tokenInfo.cardNumStart,
          card_num_end: tokenInfo.cardNumEnd,
          status: "active",
        } as any,
        { onConflict: "company_id,provider,token" }
      )
    } catch (e: any) {
      // no secrets/PII
      agentAppendLog({
        location: "confirm/route.ts:tokenPersist",
        message: "Token persist failed",
        data: { checkoutId: checkout.id, error: String(e?.message || e) },
        timestamp: Date.now(),
        hypothesisId: "H5",
      })
    }
  }

  // Issue invoice/receipt (idempotent)
  const issuerCompanyId = String(process.env.VOW_BILLING_COMPANY_ID || "").trim()
  let issued: any = null
  let issueErr: any = null
  if (issuerCompanyId) {
    const rr = await adminDb.rpc("issue_paid_checkout_document_service", {
      p_checkout_session_id: String(checkout.id),
      p_issuer_company_id: issuerCompanyId,
    } as any)
    issued = rr.data
    issueErr = rr.error
  }

  const issuedRow = Array.isArray(issued) ? (issued[0] as any) : (issued as any)

  agentAppendLog({
    location: "confirm/route.ts:documentIssuance",
    message: "Document issuance result",
    data: {
      checkoutId: checkout.id,
      issuerCompanyId: !!issuerCompanyId,
      issueErr: issueErr
        ? {
            message: String((issueErr as any)?.message || ""),
            code: (issueErr as any)?.code ?? null,
            details: (issueErr as any)?.details ?? null,
            hint: (issueErr as any)?.hint ?? null,
          }
        : null,
      issuedOk: issuedRow?.ok ?? null,
      issuedDocumentId: issuedRow?.document_id ? String(issuedRow.document_id) : null,
      issuedDocumentNumber: issuedRow?.document_number ? String(issuedRow.document_number) : null,
    },
    timestamp: Date.now(),
    hypothesisId: "H3",
  })

  // Generate and store signed PDFs immediately after issuance (do not wait for first download).
  if (!issueErr && issuedRow?.ok === true && issuedRow?.document_id) {
    const issuedDocumentId = String(issuedRow.document_id)
    // #region agent log
    try {
      const { data: issuedDocSnapshot } = await adminDb
        .from("documents")
        .select("id, company_id, customer_name, customer_tax_id, document_type")
        .eq("id", issuedDocumentId)
        .maybeSingle()
      const { data: issuerCompanySnapshot } = await adminDb
        .from("companies")
        .select("id, company_name, registration_number, company_number, logo_url, signature_url, address, email")
        .eq("id", String((issuedDocSnapshot as any)?.company_id || ""))
        .maybeSingle()
      agentAppendLog({
        location: "confirm/route.ts:issuerSnapshotAfterIssuance",
        message: "Issued document + issuer company profile snapshot",
        data: {
          checkoutId: checkout.id,
          documentId: issuedDocumentId,
          hasIssuedDoc: !!issuedDocSnapshot,
          hasIssuerCompany: !!issuerCompanySnapshot,
          hasCompanyName: !!String((issuerCompanySnapshot as any)?.company_name || "").trim(),
          hasTaxId: !!String((issuerCompanySnapshot as any)?.registration_number || (issuerCompanySnapshot as any)?.company_number || "").trim(),
          hasLogoUrl: !!String((issuerCompanySnapshot as any)?.logo_url || "").trim(),
          hasSignatureUrl: !!String((issuerCompanySnapshot as any)?.signature_url || "").trim(),
          hasAddress: !!String((issuerCompanySnapshot as any)?.address || "").trim(),
          hasEmail: !!String((issuerCompanySnapshot as any)?.email || "").trim(),
        },
        timestamp: Date.now(),
        hypothesisId: "H_ISSUER_PROFILE_DATA",
      })
    } catch {}
    // #endregion

    const [origRes, copyRes] = await Promise.allSettled([
      generateDocumentPDF(issuedDocumentId, {
        language: "he",
        mode: "recovery",
        context: "issue",
        variant: "original",
        isIssuance: true,
        requestId: `confirm-orig-${String(checkout.id)}`,
      }),
      generateDocumentPDF(issuedDocumentId, {
        language: "he",
        mode: "recovery",
        context: "download",
        variant: "copy",
        isIssuance: true,
        requestId: `confirm-copy-${String(checkout.id)}`,
      }),
    ])

    agentAppendLog({
      location: "confirm/route.ts:issuancePdfPreGen",
      message: "Issuance PDF pre-generation result",
      data: {
        checkoutId: checkout.id,
        documentId: issuedDocumentId,
        original:
          origRes.status === "fulfilled"
            ? { ok: !!origRes.value?.success, error: origRes.value?.success ? null : String(origRes.value?.error || "unknown") }
            : { ok: false, error: String((origRes as PromiseRejectedResult).reason?.message || (origRes as PromiseRejectedResult).reason || "rejected") },
        copy:
          copyRes.status === "fulfilled"
            ? { ok: !!copyRes.value?.success, error: copyRes.value?.success ? null : String(copyRes.value?.error || "unknown") }
            : { ok: false, error: String((copyRes as PromiseRejectedResult).reason?.message || (copyRes as PromiseRejectedResult).reason || "rejected") },
      },
      timestamp: Date.now(),
      hypothesisId: "H_ISSUANCE_PDF_PREGEN",
    })
  }

  // #region agent log
  // Runtime evidence for missing items/payments: verify line-items exist right after issuance.
  try {
    const issuedDocumentId = issuedRow?.document_id ? String(issuedRow.document_id) : null
    if (issuedDocumentId) {
      const { data: li, error: liErr } = await adminDb
        .from("document_line_items")
        .select("id, line_number, description, payment_metadata")
        .eq("document_id", issuedDocumentId)
        .order("line_number", { ascending: true })
        .limit(10)
      agentAppendLog({
        location: "confirm/route.ts:issuedLineItems",
        message: "Issued document line items snapshot",
        data: {
          checkoutId: checkout.id,
          documentId: issuedDocumentId,
          count: Array.isArray(li) ? li.length : 0,
          hasError: !!liErr,
          kinds: Array.isArray(li) ? li.map((x: any) => String((x?.payment_metadata as any)?.kind || "")).filter(Boolean) : [],
          cardLast4: (tokenInfo as any)?.cardNumEnd ? String((tokenInfo as any)?.cardNumEnd) : null,
          cardBrand: (tokenInfo as any)?.brand ? String((tokenInfo as any)?.brand) : null,
        },
        timestamp: Date.now(),
        hypothesisId: "H_ITEMS_PAYMENTS",
      })
    }
  } catch (e: any) {
    agentAppendLog({
      location: "confirm/route.ts:issuedLineItems",
      message: "Issued document line items snapshot failed",
      data: { checkoutId: checkout.id, error: String(e?.message || e) },
      timestamp: Date.now(),
      hypothesisId: "H_ITEMS_PAYMENTS",
    })
  }
  // #endregion

  return NextResponse.json({
    ok: true,
    paid: true,
    checkout_session_id: String(checkout.id),
    updated_subscription: !subErr,
    issued_document_ok: !(issueErr) && Array.isArray(issued) && issued[0] ? issued[0].ok === true : false,
  })
}

