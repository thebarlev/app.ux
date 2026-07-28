import type { CSSProperties } from "react"

/**
 * The status vocabulary the document lists show.
 *
 * Extracted from DocumentsListClient so the dashboard renders the same badge
 * from the same rules rather than keeping a second, drifting definition.
 */
export type UIStatus = "open" | "closed" | "canceling" | "canceled"

export const ACCOUNTING_DOC_TYPES = new Set(["receipt", "tax_invoice", "invoice_receipt", "credit_note"])

export function computeUiStatus(doc: any): UIStatus {
  const ds = String(doc?.document_status || "").toLowerCase()
  const isDocCanceled = ds === "canceled" || ds === "cancelled" || ds === "void"
  const isCanceledByCredit = doc?.is_canceled_by_credit === true
  const isCanceling =
    String(doc?.document_type || "").toLowerCase() === "credit_note" ||
    doc?.has_outgoing_credit_link === true

  const total =
    typeof doc?.total_amount === "number" ? doc.total_amount : doc?.total_amount ? Number(doc.total_amount) : null
  const outstanding =
    typeof doc?.outstanding_balance === "number"
      ? doc.outstanding_balance
      : doc?.outstanding_balance
        ? Number(doc.outstanding_balance)
        : null
  const isFinal = ds === "final"

  // Priority: מבוטל > מבטל > סגור > פתוח
  if (isDocCanceled || isCanceledByCredit) return "canceled"
  if (isCanceling) return "canceling"

  if (typeof outstanding === "number" && Number.isFinite(outstanding)) {
    return outstanding <= 0 ? "closed" : "open"
  }

  // Fallback for docs without accounting fields: final => closed else open
  if (isFinal) return "closed"
  if (typeof total === "number" && total === 0) return "closed"
  return "open"
}

export function getStatusBadgeFromUi(status: UIStatus): { label: string; style: CSSProperties } {
  switch (status) {
    case "open":
      return { label: "פתוח", style: { backgroundColor: "#E8F2FF", color: "#1D4ED8" } }
    case "closed":
      return { label: "סגור", style: { backgroundColor: "#E9F8F0", color: "#167C4B" } }
    case "canceling":
      return { label: "מבטל", style: { backgroundColor: "#F3E8FF", color: "#6D28D9" } }
    case "canceled":
      return { label: "סגור", style: { backgroundColor: "#E9F8F0", color: "#167C4B" } }
  }
}

/**
 * Accounting documents distinguish a cancelled document from a cancelling one;
 * everything else falls back to the plain open/closed reading.
 */
export function getStatusBadgeForDoc(docType: string, status: UIStatus): { label: string; style: CSSProperties } {
  const t = String(docType || "").toLowerCase()
  if (ACCOUNTING_DOC_TYPES.has(t)) {
    if (status === "canceled") return { label: "מבוטל", style: { backgroundColor: "#FDE8E8", color: "#B91C1C" } }
    if (status === "canceling") return { label: "מבטל", style: { backgroundColor: "#F3E8FF", color: "#6D28D9" } }
  }
  return getStatusBadgeFromUi(status)
}
