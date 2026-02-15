import "server-only"

const SHAAM_INVOICE_SANDBOX_BASE_URL = "https://t-ita-api.taxes.gov.il/shaam/tsandbox" as const

export type ShaamConfirmationNumberPayload = {
  customer_vat_number: number
  vat_number: number
  payment_amount: number
  vat_amount: number
  invoice_date: string // YYYY-MM-DD
  invoice_reference_number: string // max 20 chars, must NOT be UUID
}

export type ShaamConfirmationNumberCallResult =
  | { ok: true; kind: "received"; confirmation_number: string; provider_json: any }
  | { ok: false; kind: "decision_required"; error_id: string; provider_json: any }
  | { ok: false; kind: "unauthorized"; provider_json: any }
  | { ok: false; kind: "bad_request"; provider_json: any }
  | { ok: false; kind: "temporary_failure"; provider_json: any }

function isYmdDate(s: string): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function validatePayload(p: ShaamConfirmationNumberPayload) {
  if (!Number.isInteger(p.customer_vat_number) || p.customer_vat_number <= 0) throw new Error("invalid_customer_vat_number")
  if (!Number.isInteger(p.vat_number) || p.vat_number <= 0) throw new Error("invalid_vat_number")
  if (!Number.isFinite(p.payment_amount) || p.payment_amount < 0) throw new Error("invalid_payment_amount")
  if (!Number.isFinite(p.vat_amount) || p.vat_amount < 0) throw new Error("invalid_vat_amount")
  if (!isYmdDate(p.invoice_date)) throw new Error("invalid_invoice_date")
  const ref = String(p.invoice_reference_number || "").trim()
  if (!ref) throw new Error("invalid_invoice_reference_number")
  if (ref.length > 20) throw new Error("invalid_invoice_reference_number_length")
}

export async function callShaamConfirmationNumber(params: {
  accessToken: string
  payload: ShaamConfirmationNumberPayload
}): Promise<ShaamConfirmationNumberCallResult> {
  validatePayload(params.payload)

  const url = `${SHAAM_INVOICE_SANDBOX_BASE_URL}/invoice-information/v2/confirmationNumber`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(params.payload),
    // Do NOT cache; this is a regulatory call.
    cache: "no-store",
  })

  const json = await res.json().catch(() => ({}))
  const status = res.status

  if (status === 200) {
    const cn = typeof (json as any)?.confirmation_number === "string" ? String((json as any).confirmation_number).trim() : ""
    if (!cn) {
      return { ok: false, kind: "temporary_failure", provider_json: json }
    }
    return { ok: true, kind: "received", confirmation_number: cn, provider_json: json }
  }

  if (status === 406) {
    const errorId = typeof (json as any)?.error_id === "string" ? String((json as any).error_id).trim() : ""
    if (!errorId) {
      return { ok: false, kind: "temporary_failure", provider_json: json }
    }
    return { ok: false, kind: "decision_required", error_id: errorId, provider_json: json }
  }

  if (status === 401) {
    return { ok: false, kind: "unauthorized", provider_json: json }
  }

  if (status >= 400 && status < 500) {
    return { ok: false, kind: "bad_request", provider_json: json }
  }

  return { ok: false, kind: "temporary_failure", provider_json: json }
}

