import "server-only"

import { formatAllocationNumber } from "@/lib/documents/allocation-number"

import { createClient } from "@/lib/supabase/server"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"
import { getAllDocumentConfigs } from "@/lib/documents/document-configs"

const DOC_CONFIG_BY_DB = new Map(getAllDocumentConfigs().map((c) => [c.dbValue, c]))

/**
 * The real document page (…/<routeSegment>/<id>/summary) — the same target as the
 * documents-list number click and the "צפייה" action. NOT /dashboard/documents/[id],
 * which is the general-overview page, not the compliant invoice. Null for an
 * unknown type.
 */
function documentSummaryHref(documentType: string, id: string): string | null {
  const config = DOC_CONFIG_BY_DB.get(documentType)
  if (!config) return null
  const basePath = config.category === "business" ? "/business/documents" : "/dashboard/documents"
  return `${basePath}/${config.routeSegment}/${id}/summary`
}

// Revenue-generating income document types (DB snake_case).
const INCOME_TYPES = ["tax_invoice", "invoice_receipt", "receipt"]
const CREDIT_TYPES = ["credit_note", "creditNote"]

/**
 * Types that represent the actual charge to the customer, for net-revenue sums.
 * Deliberately excludes `receipt`: a standalone receipt is the payment of a
 * tax invoice, so counting both would double the amount. Also excludes quotes,
 * proformas and delivery notes, which are not money.
 */
const REVENUE_TYPES = ["tax_invoice", "invoice_receipt"]

/**
 * THE single definition of revenue for the dashboard: invoices count positive,
 * credit notes negative, everything else is zero. The month KPI, the revenue
 * chart and the per-month panel all go through this, so the same month can
 * never show three different numbers.
 */
function netRevenueOf(doc: any): number {
  const t = String(doc?.document_type || "")
  const total = num(doc?.total_amount)
  if (REVENUE_TYPES.includes(t)) return total
  if (CREDIT_TYPES.includes(t)) return -total
  return 0
}

const TYPE_LABELS: Record<string, string> = {
  tax_invoice: "חשבונית מס",
  invoice_receipt: "חשבונית/קבלה",
  receipt: "קבלה",
  credit_note: "חשבונית זיכוי",
  creditNote: "חשבונית זיכוי",
}

export type ShaamChipState = "ok" | "warn" | "expired" | "none"

export type DashboardData = {
  kpis: {
    monthRevenue: number
    docsThisMonth: number
    allocationsThisMonth: number
    pendingPayment: number
    pendingCount: number
  }
  revenueByMonth: { label: string; value: number }[]
  /**
   * Documents issued per month, newest first, over the same 7-month window.
   * Counts issued (final) documents only — no dependency on payment state or
   * document_links, so it is always complete and accurate.
   */
  docsByMonth: { label: string; count: number; amount: number }[]
  recentDocs: {
    id: string
    number: string
    type: string
    typeLabel: string
    /** Link to the real document page; null when the type has no configured route. */
    href: string | null
    customerName: string
    customerId: string | null
    allocationNumber: string | null
    total: number
    /** Same vocabulary as the income/documents list: closed vs open. */
    status: "closed" | "open"
    /** Direct PDF download for this document. */
    pdfHref: string
    /** Start a chained receipt from this document; null when not chainable. */
    chainHref: string | null
    date: string
  }[]
  shaam: {
    state: ShaamChipState
    refreshExpiresAt: string | null
    daysToRefreshExpiry: number | null
    /** False for an osek patur, who can never need an allocation number. */
    applies: boolean
  }
}

const MONTHS_HE = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"]

function num(v: any): number {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Builds the "issue a receipt for this" link, matching the parameters the
 * documents list already passes when starting a chain, so the receipt form
 * prefills identically from either entry point.
 */
function chainReceiptHref(doc: {
  id: string
  documentType: string
  documentNumber: string
  customerId: string | null
  customerName: string
}): string | null {
  // Only documents that represent an obligation can have a receipt issued.
  if (!CHAINABLE_TO_RECEIPT.has(doc.documentType)) return null
  const params = new URLSearchParams()
  params.set("sourceDocumentId", doc.id)
  if (doc.customerId) params.set("customerId", doc.customerId)
  if (doc.customerName) params.set("customerName", doc.customerName)
  const sourceLabel = TYPE_LABELS[doc.documentType] || doc.documentType
  if (doc.documentNumber) params.set("notes", `קבלה עבור ${sourceLabel} ${doc.documentNumber}`)
  return `/dashboard/incomes/documents/new/receipt?${params.toString()}`
}

const CHAINABLE_TO_RECEIPT = new Set(["tax_invoice", "proforma"])

export async function getDashboardData(now: Date = new Date()): Promise<DashboardData> {
  const companyId = await resolveCurrentCompanyId()
  const supabase = await createClient()

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const window7Start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1))

  const { data: rows } = await supabase
    .from("documents")
    .select(
      "id, document_number, document_type, document_status, issue_date, total_amount, outstanding_balance, allocation_number, allocation_status, customer_name, customer_id"
    )
    .eq("company_id", companyId)
    .eq("document_status", "final")
    .gte("issue_date", ymd(window7Start))
    .order("issue_date", { ascending: false })
    .limit(500)

  const docs: any[] = Array.isArray(rows) ? (rows as any[]) : []
  // Upper-bounded, so a future-dated document lands in its own month rather than
  // inflating the current-month KPI — which would put the KPI out of step with
  // the chart and the per-month panel, both of which bucket by calendar month.
  const inMonth = (iso: string | null) => {
    if (!iso) return false
    const day = String(iso).slice(0, 10)
    return day >= ymd(monthStart) && day < ymd(nextMonthStart)
  }
  // Still the broad set (includes standalone receipts) — used for outstanding
  // balances and allocation flags, which are per-document, not summed revenue.
  const isIncome = (t: string) => INCOME_TYPES.includes(t)

  // ── KPIs ──
  let monthRevenue = 0
  let docsThisMonth = 0
  let allocationsThisMonth = 0
  for (const d of docs) {
    if (inMonth((d as any).issue_date)) {
      docsThisMonth++
      monthRevenue += netRevenueOf(d)
      if ((d as any).allocation_number) allocationsThisMonth++
    }
  }

  // pending payment (all open income docs, not just this month)
  let pendingPayment = 0
  let pendingCount = 0
  for (const d of docs) {
    const t = String((d as any).document_type || "")
    if (!isIncome(t)) continue
    const outstanding = num((d as any).outstanding_balance)
    if (outstanding > 0.005) {
      pendingPayment += outstanding
      pendingCount++
    }
  }

  // ── Revenue by month (last 7 months) ──
  const buckets = new Map<string, number>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    buckets.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, 0)
  }
  for (const d of docs) {
    const iso = (d as any).issue_date ? new Date(String((d as any).issue_date)) : null
    if (!iso) continue
    const key = `${iso.getUTCFullYear()}-${iso.getUTCMonth()}`
    if (!buckets.has(key)) continue
    buckets.set(key, (buckets.get(key) || 0) + netRevenueOf(d))
  }
  // Not clamped at zero any more: a month whose credits exceed its invoices must
  // report the same negative figure here as in the per-month panel. The chart
  // clamps for geometry only (see buildChart).
  const revenueByMonth = Array.from(buckets.entries()).map(([key, value]) => {
    const m = Number(key.split("-")[1])
    return { label: MONTHS_HE[m] || "", value: Math.round(value) }
  })

  // ── Documents issued per month (same window and same rows as above) ──
  // count  → every issued document, whatever its type (issuing volume).
  // amount → net revenue only: tax invoices + invoice/receipts, minus credit
  //          notes. Standalone receipts are excluded so a paid tax invoice is
  //          not counted twice, and quotes/proformas/delivery notes never count.
  // Neither figure touches payment state or document_links, so both stay accurate.
  const monthDocs = new Map<string, { count: number; amount: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    monthDocs.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, { count: 0, amount: 0 })
  }
  for (const d of docs) {
    const iso = d.issue_date ? new Date(String(d.issue_date)) : null
    if (!iso) continue
    const bucket = monthDocs.get(`${iso.getUTCFullYear()}-${iso.getUTCMonth()}`)
    if (!bucket) continue
    bucket.count++
    bucket.amount += netRevenueOf(d)
  }
  const docsByMonth = Array.from(monthDocs.entries())
    .map(([key, v]) => {
      const m = Number(key.split("-")[1])
      return { label: MONTHS_HE[m] || "", count: v.count, amount: Math.round(v.amount) }
    })
    .reverse()

  // ── Recent documents ──
  const recent = docs.slice(0, 8)

  // documents.customer_name can hold a stale value or an email (same bug already
  // fixed in the forms). Resolve the real name from the customers table by id and
  // prefer it; fall back to the document's stored name only when there is no
  // customer_id to resolve against.
  const recentCustomerIds = Array.from(
    new Set(recent.map((d: any) => d.customer_id).filter(Boolean).map(String))
  )
  const customerNameById = new Map<string, string>()
  if (recentCustomerIds.length > 0) {
    const { data: custRows } = await supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", recentCustomerIds)
    for (const c of custRows || []) {
      const nm = String((c as any).name || "").trim()
      if (nm) customerNameById.set(String((c as any).id), nm)
    }
  }

  const recentDocs = recent.map((d: any) => {
    const t = String(d.document_type || "")
    const outstanding = num(d.outstanding_balance)
    const total = num(d.total_amount)
    const requiresAlloc = isIncome(t)
    const cid = d.customer_id ? String(d.customer_id) : null
    return {
      id: String(d.id),
      number: String(d.document_number || ""),
      type: t,
      typeLabel: TYPE_LABELS[t] || t,
      href: documentSummaryHref(t, String(d.id)),
      customerName: (cid && customerNameById.get(cid)) || String(d.customer_name || ""),
      customerId: cid,
      // The stored value is ITA's "<17-char timestamp><9-digit allocation>".
      // The PDF already prints only the 9 digits; the dashboard was showing the
      // whole concatenation.
      allocationNumber: formatAllocationNumber(d.allocation_number),
      total,
      status: (outstanding > 0.005 ? "open" : "closed") as "closed" | "open",
      pdfHref: `/api/documents/${String(d.id)}/pdf`,
      chainHref: chainReceiptHref({
        id: String(d.id),
        documentType: t,
        documentNumber: String(d.document_number || ""),
        customerId: cid,
        customerName: (cid && customerNameById.get(cid)) || String(d.customer_name || ""),
      }),
      date: d.issue_date ? String(d.issue_date).slice(0, 10) : "",
      requiresAlloc,
    }
  })

  // ── SHAAM connection chip ──
  const { data: conn } = await supabase
    .from("company_shaam_connections_safe")
    .select("status, refresh_expires_at, revoked_at")
    .eq("company_id", companyId)
    .maybeSingle()

  // An osek patur may not issue a tax invoice or an invoice-receipt, which are
  // the only documents that ever need an allocation number. The SHAAM connection
  // is therefore irrelevant to them — surfacing a red "not connected" chip only
  // pushes them toward a connection they will never use.
  const { data: chipCompany } = await supabase
    .from("companies")
    .select("business_type")
    .eq("id", companyId)
    .maybeSingle()
  const shaamApplies = String((chipCompany as any)?.business_type || "") !== "osek_patur"

  let state: ShaamChipState = "none"
  let refreshExpiresAt: string | null = null
  let daysToRefreshExpiry: number | null = null
  if (conn) {
    const status = String((conn as any).status || "")
    refreshExpiresAt = (conn as any).refresh_expires_at ? String((conn as any).refresh_expires_at) : null
    const revoked = !!(conn as any).revoked_at
    if (status === "revoked" || status === "expired" || revoked) {
      state = "expired"
    } else if (status === "active") {
      if (refreshExpiresAt) {
        const ms = new Date(refreshExpiresAt).getTime() - now.getTime()
        daysToRefreshExpiry = Math.ceil(ms / 86_400_000)
        if (daysToRefreshExpiry <= 0) state = "expired"
        else if (daysToRefreshExpiry <= 14) state = "warn"
        else state = "ok"
      } else {
        state = "ok"
      }
    } else {
      state = "expired"
    }
  }

  return {
    kpis: { monthRevenue: Math.round(monthRevenue), docsThisMonth, allocationsThisMonth, pendingPayment: Math.round(pendingPayment), pendingCount },
    revenueByMonth,
    docsByMonth,
    recentDocs,
    shaam: { state, refreshExpiresAt, daysToRefreshExpiry, applies: shaamApplies },
  }
}
