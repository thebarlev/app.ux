import "server-only"

import { getShaamConfig } from "@/lib/shaam/config"
import { getShaamDispatcher } from "@/lib/shaam/dispatcher"

// Paths only — host comes from getShaamConfig().baseUrl. The previous
// hardcoded host (t-ita-api.taxes.gov.il) has no DNS record at all.
const DECISION_PATH_PREFIX = "/InvoiceDecisionApi/v1" as const

export type ShaamInvoiceDecisionType = "CANCEL" | "CONTINUE" | "FURTHEROBJECTION"

export type ShaamInvoiceDecisionPayload = {
  invoice_id: string // <= 50, non-empty
  vat_number: number
  authorized_company: number | null
  user_id: number | null
  user_name: string | null
  accounting_software_number: number
}

export type ShaamInvoiceDecisionCallResult =
  | { ok: true; provider_json: any }
  | { ok: false; kind: "unauthorized" | "bad_request" | "temporary_failure"; provider_json: any }

function endpointForDecision(decision: ShaamInvoiceDecisionType): string {
  const base = `${getShaamConfig().baseUrl}${DECISION_PATH_PREFIX}`
  if (decision === "CANCEL") return `${base}/Cancel`
  if (decision === "CONTINUE") return `${base}/Continue`
  return `${base}/FurtherObjection`
}

function validatePayload(p: ShaamInvoiceDecisionPayload) {
  const invoiceId = String(p.invoice_id || "").trim()
  if (!invoiceId) throw new Error("invalid_invoice_id")
  if (invoiceId.length > 50) throw new Error("invalid_invoice_id_length")
  if (!Number.isInteger(p.vat_number) || p.vat_number <= 0) throw new Error("invalid_vat_number")
  if (!Number.isInteger(p.accounting_software_number) || p.accounting_software_number <= 0) {
    throw new Error("invalid_accounting_software_number")
  }
}

export async function callShaamInvoiceDecision(params: {
  accessToken: string
  decision: ShaamInvoiceDecisionType
  payload: ShaamInvoiceDecisionPayload
}): Promise<ShaamInvoiceDecisionCallResult> {
  validatePayload(params.payload)

  const url = endpointForDecision(params.decision)
  const dispatcher = getShaamDispatcher()

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(params.payload),
    cache: "no-store",
    ...(dispatcher ? { dispatcher } : {}),
  })

  const json = await res.json().catch(() => ({}))
  const status = res.status

  if (status >= 200 && status < 300) {
    return { ok: true, provider_json: json }
  }

  if (status === 401) {
    return { ok: false, kind: "unauthorized", provider_json: json }
  }

  if (status >= 400 && status < 500) {
    return { ok: false, kind: "bad_request", provider_json: json }
  }

  return { ok: false, kind: "temporary_failure", provider_json: json }
}

