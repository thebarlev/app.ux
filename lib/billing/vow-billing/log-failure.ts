import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Persist a structured failure record for the VOW billing pipeline.
 *
 * Design notes:
 * - Best-effort. Never throws. Logging must never break the main flow.
 * - Writes to public.billing_failures (extended in migration 106).
 * - Pass `error_code` for stable values that monitoring/alerts can match on
 *   (e.g. "provider_error", "signing_failed", "finalize_unauthorized").
 * - `error_details` accepts the raw error object so we can post-mortem later.
 */
export type VowBillingFailureStage =
  | "vow_create_document_validation"
  | "vow_create_document_provider"
  | "vow_create_document_resolve_customer"
  | "vow_create_document_finalize"
  | "vow_create_document_persist"
  | "vow_repair_missing_invoice"

export type VowBillingFailureInput = {
  stage:           VowBillingFailureStage
  errorCode?:      string | null
  errorMessage?:   string | null
  errorDetails?:   unknown
  documentId?:     string | null
  userId?:         string | null
  companyId?:      string | null
}

export async function logVowBillingFailure(input: VowBillingFailureInput): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("billing_failures").insert({
      failure_stage:  input.stage,
      error_code:     input.errorCode ?? null,
      error_message:  input.errorMessage ?? null,
      error_details:  input.errorDetails ?? null,
      document_id:    input.documentId ?? null,
      user_id:        input.userId ?? null,
      company_id:     input.companyId ?? null,
    } as any)
  } catch (e: any) {
    // Secondary failure: just log to stderr — never throw.
    console.error("[VOW_BILLING][log-failure] failed to persist billing_failures row", {
      stage: input.stage,
      error_code: input.errorCode,
      secondary_error: e?.message || String(e),
    })
  }
}
