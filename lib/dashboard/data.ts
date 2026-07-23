import "server-only"

import { createClient } from "@/lib/supabase/server"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"

// Revenue-generating income document types (DB snake_case).
const INCOME_TYPES = ["tax_invoice", "invoice_receipt", "receipt"]
const CREDIT_TYPES = ["credit_note", "creditNote"]

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
  /** Payment state of income documents in the loaded window (paid / awaiting / overdue). */
  paymentStatus: { key: "paid" | "wait" | "late"; label: string; count: number; amount: number }[]
  recentDocs: {
    id: string
    number: string
    type: string
    typeLabel: string
    customerName: string
    customerId: string | null
    allocationNumber: string | null
    total: number
    status: "paid" | "wait"
    date: string
  }[]
  shaam: {
    state: ShaamChipState
    refreshExpiresAt: string | null
    daysToRefreshExpiry: number | null
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

export async function getDashboardData(now: Date = new Date()): Promise<DashboardData> {
  const companyId = await resolveCurrentCompanyId()
  const supabase = await createClient()

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const window7Start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1))

  const BASE_COLS =
    "id, document_number, document_type, document_status, issue_date, total_amount, outstanding_balance, allocation_number, allocation_status, customer_name, customer_id"

  const selectDocs = (cols: string) =>
    supabase
      .from("documents")
      .select(cols)
      .eq("company_id", companyId)
      .eq("document_status", "final")
      .gte("issue_date", ymd(window7Start))
      .order("issue_date", { ascending: false })
      .limit(500)

  // `payment_due_date` is missing on some older deployments (see lib/documents/actions.ts,
  // which handles the same PGRST204). Fall back to the base column set if so.
  let { data: rows, error: rowsError } = await selectDocs(`${BASE_COLS}, payment_due_date`)
  if (rowsError) {
    const retry = await selectDocs(BASE_COLS)
    rows = retry.data
  }

  const docs: any[] = Array.isArray(rows) ? (rows as any[]) : []
  const inMonth = (iso: string | null) => !!iso && String(iso).slice(0, 10) >= ymd(monthStart)
  const isIncome = (t: string) => INCOME_TYPES.includes(t)
  const isCredit = (t: string) => CREDIT_TYPES.includes(t)

  // ── KPIs ──
  let monthRevenue = 0
  let docsThisMonth = 0
  let allocationsThisMonth = 0
  for (const d of docs) {
    const t = String((d as any).document_type || "")
    const total = num((d as any).total_amount)
    if (inMonth((d as any).issue_date)) {
      docsThisMonth++
      if (isIncome(t)) monthRevenue += total
      else if (isCredit(t)) monthRevenue -= total
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
    const t = String((d as any).document_type || "")
    const iso = (d as any).issue_date ? new Date(String((d as any).issue_date)) : null
    if (!iso) continue
    const key = `${iso.getUTCFullYear()}-${iso.getUTCMonth()}`
    if (!buckets.has(key)) continue
    const total = num((d as any).total_amount)
    buckets.set(key, (buckets.get(key) || 0) + (isIncome(t) ? total : isCredit(t) ? -total : 0))
  }
  const revenueByMonth = Array.from(buckets.entries()).map(([key, value]) => {
    const m = Number(key.split("-")[1])
    return { label: MONTHS_HE[m] || "", value: Math.max(0, Math.round(value)) }
  })

  // ── Payment status (income documents in the loaded window) ──
  // paid   → nothing outstanding; amount is the document total.
  // wait   → outstanding, due date not passed; amount is what is still owed.
  // late   → outstanding and past due; amount is what is still owed.
  // Due date falls back to issue_date + DEFAULT_TERMS_DAYS when the document has none.
  const DEFAULT_TERMS_DAYS = 30
  const today = ymd(now)
  const pay = {
    paid: { count: 0, amount: 0 },
    wait: { count: 0, amount: 0 },
    late: { count: 0, amount: 0 },
  }
  for (const d of docs) {
    const t = String(d.document_type || "")
    if (!isIncome(t)) continue
    const outstanding = num(d.outstanding_balance)
    if (outstanding <= 0.005) {
      pay.paid.count++
      pay.paid.amount += num(d.total_amount)
      continue
    }
    const due = d.payment_due_date
      ? String(d.payment_due_date).slice(0, 10)
      : d.issue_date
        ? ymd(new Date(new Date(String(d.issue_date)).getTime() + DEFAULT_TERMS_DAYS * 86_400_000))
        : null
    const overdue = !!due && due < today
    const b = overdue ? pay.late : pay.wait
    b.count++
    b.amount += outstanding
  }
  const paymentStatus: DashboardData["paymentStatus"] = [
    { key: "paid", label: "שולם", count: pay.paid.count, amount: Math.round(pay.paid.amount) },
    { key: "wait", label: "ממתין", count: pay.wait.count, amount: Math.round(pay.wait.amount) },
    { key: "late", label: "באיחור", count: pay.late.count, amount: Math.round(pay.late.amount) },
  ]

  // ── Recent documents ──
  const recentDocs = docs.slice(0, 8).map((d: any) => {
    const t = String(d.document_type || "")
    const outstanding = num(d.outstanding_balance)
    const total = num(d.total_amount)
    const requiresAlloc = isIncome(t)
    return {
      id: String(d.id),
      number: String(d.document_number || ""),
      type: t,
      typeLabel: TYPE_LABELS[t] || t,
      customerName: String(d.customer_name || ""),
      customerId: d.customer_id ? String(d.customer_id) : null,
      allocationNumber: d.allocation_number ? String(d.allocation_number) : null,
      total,
      status: (outstanding > 0.005 ? "wait" : "paid") as "paid" | "wait",
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
    paymentStatus,
    recentDocs,
    shaam: { state, refreshExpiresAt, daysToRefreshExpiry },
  }
}
