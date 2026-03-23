import { getPosthog } from "@/lib/posthog"

type PageLanguage = "en" | "he"
type PageDirection = "ltr" | "rtl"

type UserTraits = {
  email?: string
  role?: string
}

type AuditorScanStartedPayload = {
  scan_id: string
  domain: string | null
  page_language: PageLanguage
  page_dir: PageDirection
  source_page: string
  is_logged_in: boolean
  user_id?: string | null
}

type AuditorScanCompletedPayload = {
  scan_id: string
  domain: string | null
  score_overall: number | null
  score_seo: number | null
  score_ai: number | null
  pages_scanned: number | null
  page_language: PageLanguage
  page_dir: PageDirection
  user_id?: string | null
}

type LeadCreatedPayload = {
  source: string
  page_path: string
  page_language: PageLanguage
  page_dir: PageDirection
  email_domain?: string | null
  scan_id?: string | null
  user_id?: string | null
}

type InvoicePaidPayload = {
  charge_id: string | null
  company_id: string | null
  amount: number | null
  currency: string | null
  plan: string | null
  billing_provider: string | null
  document_id: string | null
  user_id?: string | null
}

function captureEvent(event: string, properties: Record<string, unknown>) {
  const ph = getPosthog()
  if (!ph) return
  ph.capture(event, properties)
}

export function resolvePageLocale(pathname: string): { page_language: PageLanguage; page_dir: PageDirection } {
  const page_language: PageLanguage = pathname.startsWith("/en") ? "en" : "he"
  return {
    page_language,
    page_dir: page_language === "en" ? "ltr" : "rtl",
  }
}

export function captureAuditorScanStarted(payload: AuditorScanStartedPayload) {
  captureEvent("auditor_scan_started", payload)
}

export function captureAuditorScanCompleted(payload: AuditorScanCompletedPayload) {
  captureEvent("auditor_scan_completed", payload)
}

export function captureLeadCreated(payload: LeadCreatedPayload) {
  captureEvent("lead_created", payload)
}

export function captureInvoicePaid(payload: InvoicePaidPayload) {
  captureEvent("invoice_paid", payload)
}

export function capturePurchase(value: number, plan: string) {
  captureEvent("purchase", {
    value,
    currency: "USD",
    plan,
  })
}

export function identifyPosthogUser(userId: string, traits?: UserTraits) {
  if (!userId) return
  const ph = getPosthog()
  if (!ph) return

  const safeTraits: UserTraits = {}
  if (traits?.email) safeTraits.email = traits.email
  if (traits?.role) safeTraits.role = traits.role

  ph.identify(userId, safeTraits)
}

export function groupPosthogCompany(companyId: string) {
  if (!companyId) return
  const ph = getPosthog()
  if (!ph) return

  ph.group("company", companyId, {
    company_id: companyId,
  })
}
