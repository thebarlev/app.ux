import "server-only"

import { z } from "zod"

import { getShaamConfig } from "@/lib/shaam/config"
import { getShaamDispatcher } from "@/lib/shaam/dispatcher"

// Path only. The host is getShaamConfig().apiBaseUrl — the ITA serves the
// Approval API from ita-api.taxes.gov.il, which is a different host from the
// one that issues the token. Sending this to the OAuth host 404s.
const SHAAM_APPROVAL_V2_PATH = "/Invoices/v2/Approval" as const

const YMD = /^\d{4}-\d{2}-\d{2}$/
const HM = /^\d{2}:\d{2}$/

const ShaamApprovalV2ItemSchema = z
  .object({
    index: z.number().int().finite(),
    catalog_id: z.string().min(1),
    category: z.number().int().finite(),
    description: z.string().min(1),
    measure_unit_description: z.string().min(1),
    quantity: z.number().finite(),
    price_per_unit: z.number().finite(),
    discount: z.number().finite(),
    total_amount: z.number().finite(),
    vat_rate: z.number().finite(),
    vat_amount: z.number().finite(),
  })
  .strict()

export const ShaamApprovalV2PayloadSchema = z
  .object({
    invoice_id: z.string().min(1),
    invoice_type: z.number().int().finite(),
    vat_number: z.number().int().finite(),
    union_vat_number: z.number().int().finite().nullable(),
    // Nullable per ITA: third-party-proxy field only. For self-issuance it is
    // null and omitNullish drops it from the wire (verified — HTTP 200).
    authorized_company: z.number().int().finite().nullable(),
    // ITA requires at least one of user_id (ת.ז) or user_name. We populate
    // user_id from the issuer's registration_number; nullable only as a
    // last-resort fallback, where user_name still satisfies the requirement.
    user_id: z.number().int().finite().nullable(),
    user_name: z.string().min(1),
    invoice_reference_number: z.string().min(1),
    customer_vat_number: z.number().int().finite().nullable(),
    customer_name: z.string().min(1),
    customer_country_code: z.string().min(1),
    invoice_date: z.string().regex(YMD),
    invoice_issuance_date: z.string().regex(YMD),
    branch_id: z.string().min(1),
    accounting_software_number: z.number().int().finite(),
    // Optional per ITA: omitted from the wire entirely when not configured.
    // Must never be sent as "" or null — the gateway rejects both.
    client_software_key: z.string().min(1).optional(),
    amount_before_discount: z.number().finite(),
    discount: z.number().finite(),
    payment_amount: z.number().finite(),
    vat_amount: z.number().finite(),
    payment_amount_including_vat: z.number().finite(),
    invoice_note: z.string(),
    action: z.number().int().finite(),
    vehicle_license_number: z.number().int().finite().nullable(),
    phone_of_driver: z.string().nullable(),
    arrival_date: z.string().regex(YMD).nullable(),
    estimated_arrival_time: z.string().regex(HM).nullable(),
    transition_location: z.number().int().finite().nullable(),
    delivery_address: z.string().nullable(),
    additional_information: z.number().int().finite().nullable(),
    additional_information_1: z.string().nullable(),
    additional_information_2: z.string().nullable(),
    additional_information_3: z.number().int().finite().nullable(),
    items: z.array(ShaamApprovalV2ItemSchema).min(1),
  })
  .strict()

export type ShaamApprovalV2Payload = z.infer<typeof ShaamApprovalV2PayloadSchema>

export type ShaamApprovalV2CallResult =
  | { ok: true; kind: "approved"; confirmation_number: string; provider_json: any }
  | { ok: true; kind: "rejected"; provider_json: any }
  | { ok: false; kind: "decision_required"; error_id: string; provider_json: any }
  | { ok: false; kind: "unauthorized"; provider_json: any }
  | { ok: false; kind: "bad_request"; provider_json: any }
  | { ok: false; kind: "temporary_failure"; provider_json: any }

/**
 * The ITA gateway validates against its own JSON schema and rejects an explicit
 * null for an optional field with 422 [JSV0001] "Invalid value type 'null'".
 * Optional fields must be omitted, not sent as null. Verified against the
 * sandbox: identical payload 422s with nulls present, 200s with them removed.
 */
function omitNullish<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    out[k] = v
  }
  return out as Partial<T>
}

export async function callShaamInvoiceApprovalV2(params: {
  accessToken: string
  payload: ShaamApprovalV2Payload
}): Promise<ShaamApprovalV2CallResult> {
  // Runtime validation: strict schema, correct types/formats, no extra keys.
  const payload = ShaamApprovalV2PayloadSchema.parse(params.payload)

  // Validate first (nullable stays legal in our own contract), then drop the
  // nulls on the wire only.
  const wirePayload = omitNullish(payload)

  const dispatcher = getShaamDispatcher()
  const url = `${getShaamConfig().apiBaseUrl}${SHAAM_APPROVAL_V2_PATH}`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify(wirePayload),
    // Do NOT cache; this is a regulatory call.
    cache: "no-store",
    ...(dispatcher ? { dispatcher } : {}),
  })

  const json = await res.json().catch(() => ({}))
  const status = res.status

  if (status === 200) {
    const approved = typeof (json as any)?.approved === "boolean" ? Boolean((json as any).approved) : null
    const innerStatus = typeof (json as any)?.status === "number" ? Number((json as any).status) : null
    if (innerStatus !== 200 || approved === null) {
      return { ok: false, kind: "temporary_failure", provider_json: json }
    }

    if (approved) {
      const cn = typeof (json as any)?.confirmation_number === "string" ? String((json as any).confirmation_number).trim() : ""
      if (!cn) return { ok: false, kind: "temporary_failure", provider_json: json }
      return { ok: true, kind: "approved", confirmation_number: cn, provider_json: json }
    }

    return { ok: true, kind: "rejected", provider_json: json }
  }

  if (status === 401) {
    return { ok: false, kind: "unauthorized", provider_json: json }
  }

  // Some flows may return decision-required semantics (legacy compatibility).
  if (status === 406) {
    const errorId = typeof (json as any)?.error_id === "string" ? String((json as any).error_id).trim() : ""
    if (!errorId) return { ok: false, kind: "temporary_failure", provider_json: json }
    return { ok: false, kind: "decision_required", error_id: errorId, provider_json: json }
  }

  if (status >= 400 && status < 500) {
    return { ok: false, kind: "bad_request", provider_json: json }
  }

  return { ok: false, kind: "temporary_failure", provider_json: json }
}

