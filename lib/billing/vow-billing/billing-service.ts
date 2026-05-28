import "server-only"

import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { getProvider } from "@/lib/billing/vow-billing/providers"
import { withRetry } from "@/lib/billing/vow-billing/retry"
import { logVowBillingFailure } from "@/lib/billing/vow-billing/log-failure"
import type { VowBillingCreateDocumentInput } from "@/lib/billing/vow-billing/types"
import { DocIssueTracker } from "@/lib/diagnostics/external-services-check"

const CreateDocumentSchema = z.object({
  user_id: z.string().min(1),
  email: z.string().email(),
  country: z.string().min(2).max(2),
  amount: z.number().finite().positive(),
  currency: z.string().min(1).max(8),
  language: z.enum(["he", "en"]),
  is_israeli: z.boolean(),
  /**
   * Optional caller-supplied idempotency key. Bounded length to keep
   * the index small and to defend against accidentally gigantic strings.
   * When supplied, two calls with the same (provider, idempotency_key)
   * pair return the same document — no duplicate billing.
   */
  idempotency_key: z.string().min(1).max(200).optional(),
})

function money2(n: number): number {
  return Number(Number(n).toFixed(2))
}

/**
 * Refresh the signed download URL for an already-issued document.
 * Signed URLs expire (60 minutes), so cache hits must always re-sign
 * before returning to the caller.
 */
async function resignDocumentUrl(documentId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data: doc, error } = await admin
      .from("documents")
      .select("pdf_storage_key")
      .eq("id", documentId)
      .maybeSingle()
    if (error || !doc?.pdf_storage_key) return null

    const signed = await admin.storage
      .from(SECURE_ASSETS_BUCKET)
      .createSignedUrl(String(doc.pdf_storage_key), 60 * 60)
    if (signed.error || !signed.data?.signedUrl) return null
    return String(signed.data.signedUrl)
  } catch {
    return null
  }
}

export async function createBillingDocument(
  input: VowBillingCreateDocumentInput,
  opts?: { tracker?: DocIssueTracker },
): Promise<{
  success: true
  document_id: string
  document_url: string | null
  vat: number
  /** True when the response came from the idempotency cache. */
  idempotent_replay?: boolean
} | {
  success: false
  message: string
  code?: string
}> {
  const tracker = opts?.tracker ?? new DocIssueTracker()
  const parsed = CreateDocumentSchema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
    tracker.fail("validate_input", new Error(issues), {
      paths: parsed.error.issues.map(i => i.path.join(".")),
    })
    await logVowBillingFailure({
      stage:        "vow_create_document_validation",
      errorCode:    "validation_error",
      errorMessage: issues,
      errorDetails: { issues: parsed.error.issues, received: input },
      userId:       (input as any)?.user_id ?? null,
    })
    return { success: false, message: "Invalid request", code: "validation_error" }
  }

  const body = parsed.data

  const issuerCompanyId = String(process.env.VOW_BILLING_COMPANY_ID || "").trim()
  if (!issuerCompanyId) {
    tracker.fail("resolve_issuer_company", new Error("missing_VOW_BILLING_COMPANY_ID"))
    await logVowBillingFailure({
      stage:        "vow_create_document_validation",
      errorCode:    "misconfigured",
      errorMessage: "Missing VOW_BILLING_COMPANY_ID env var",
      userId:       body.user_id ?? null,
    })
    return { success: false, message: "Missing VOW_BILLING_COMPANY_ID", code: "misconfigured" }
  }
  tracker.step("resolve_issuer_company", { company_id: issuerCompanyId })

  const isIsraeli = body.is_israeli === true
  const language: "he" | "en" = isIsraeli ? "he" : "en"
  const documentType = isIsraeli ? ("invoice_receipt" as const) : ("invoice_receipt" as const)

  // `body.amount` is the GROSS amount actually charged on Cardcom
  // (VAT-inclusive for Israeli customers, no VAT for non-Israeli). The
  // invoice must break that gross into subtotal + VAT where the two add
  // up to exactly what the customer paid — otherwise the "receipts"
  // section on the invoice would not match the Cardcom charge.
  //
  // Israeli VAT rate is 18% as of 2025-01-01 (was 17%).
  //
  // We derive vatAmount as `gross - subtotal` (not `subtotal * rate`) so
  // the two pieces always sum to `gross` after rounding.
  const vatRate     = isIsraeli ? 18 : 0
  const grossPaid   = money2(body.amount)
  const subtotal    = isIsraeli
    ? money2(grossPaid / (1 + vatRate / 100))
    : grossPaid
  const vatAmount   = money2(grossPaid - subtotal)
  const totalAmount = grossPaid

  // The provider's `IssueDocumentParams.amount` field is the line-item
  // unit price (pre-VAT subtotal). Keep the existing identifier so the
  // call site below doesn't change.
  const amount = subtotal

  const provider = getProvider(process.env.VOW_BILLING_PROVIDER || "internal")

  // ── Pre-flight idempotency lookup ────────────────────────────────────
  // If the caller passed an idempotency_key, we MUST first check whether
  // a document was already issued for that (provider, key) pair. The
  // unique partial index in migration 108 also enforces this on insert
  // — that's the safety net for races between two concurrent callers
  // (e.g. mioshy indicator + repair cron). We handle both:
  //   a) Pre-flight hit  → return cached result with a freshly signed URL.
  //   b) Pre-flight miss → issue normally; if the insert later fails with
  //      23505 (unique violation), we re-fetch and return the row that
  //      the racing caller created.
  const idempotencyKey = body.idempotency_key?.trim() || null

  if (idempotencyKey) {
    try {
      const admin = createAdminClient()
      const { data: existing } = await admin
        .from("vow_billing_issued_documents")
        .select("document_id, vat")
        .eq("provider", provider.name)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()

      if (existing?.document_id) {
        const documentId = String(existing.document_id)
        const url = await resignDocumentUrl(documentId)
        console.info("[VOW_BILLING] idempotent cache hit", {
          provider: provider.name,
          idempotency_key: idempotencyKey,
          document_id: documentId,
          url_resigned: !!url,
        })
        return {
          success: true,
          document_id: documentId,
          document_url: url,
          vat: Number(existing.vat ?? vatAmount),
          idempotent_replay: true,
        }
      }
    } catch (e: any) {
      // Lookup failure is non-fatal — fall through to issuance and let
      // the unique index protect us. Log it so we can spot DB issues.
      console.warn("[VOW_BILLING] idempotency pre-flight lookup failed (continuing)", {
        idempotency_key: idempotencyKey,
        error: e?.message || String(e),
      })
    }
  }

  // ── Issue ────────────────────────────────────────────────────────────
  tracker.step("provider_issue_start", { provider: provider.name })
  const issued = await withRetry(
    async () => {
      return await provider.issueDocument({
        companyId: issuerCompanyId,
        documentType,
        language,
        customer: {
          name: null,
          email: body.email,
          country: body.country,
        },
        amount,
        currency: body.currency,
        vatRate,
        vatAmount,
        totalAmount,
        idempotencyKey,
        metadata: {
          user_id: body.user_id,
          requested_language: body.language,
          is_israeli: body.is_israeli,
          idempotency_key: idempotencyKey,
          attempt_id: tracker.attemptId,
        },
      })
    },
    {
      maxRetries: 3,
      baseDelayMs: 1_000,
      onRetry: ({ attempt, delayMs, error }) => {
        console.warn("[VOW_BILLING] provider issueDocument retry", {
          provider: provider.name,
          attempt,
          delayMs,
          error: (error as any)?.message || String(error),
        })
      },
    }
  )

  if (!issued.ok) {
    tracker.fail("provider_issue_failed", new Error(String(issued.error || "provider_error")), {
      provider: provider.name,
      status: issued.status ?? null,
    })
    console.error("[VOW_BILLING] provider issueDocument failed", {
      provider: provider.name,
      error: issued.error,
      status: issued.status,
    })
    await logVowBillingFailure({
      stage:        "vow_create_document_provider",
      errorCode:    "provider_error",
      errorMessage: String(issued.error || "provider_error"),
      errorDetails: { provider: provider.name, status: issued.status },
      userId:       body.user_id,
      companyId:    issuerCompanyId,
    })
    return { success: false, message: "Billing provider error", code: "provider_error" }
  }

  tracker.step("provider_issue_ok", {
    provider: provider.name,
    document_id: issued.documentId,
  })

  // ── Persist billing record ───────────────────────────────────────────
  // The provider already inserted/updated the vow_billing_issued_documents
  // row when an idempotencyKey was given (see internal-provider.ts). If
  // no key was given, the legacy unguarded insert below is used.
  if (!idempotencyKey) {
    try {
      const admin = createAdminClient()
      await admin.from("vow_billing_issued_documents").insert({
        user_id: body.user_id,
        document_id: issued.documentId,
        amount,
        vat: vatAmount,
        country: body.country,
        currency: body.currency,
        language,
        provider: provider.name,
        document_url: issued.documentUrl,
        idempotency_key: null,
        created_at: new Date().toISOString(),
      } as any)
    } catch (e: any) {
      console.error("[VOW_BILLING] failed to persist vow_billing_issued_documents", {
        error: e?.message || String(e),
        documentId: issued.documentId,
      })
      await logVowBillingFailure({
        stage:        "vow_create_document_persist",
        errorCode:    "persist_failed",
        errorMessage: e?.message || String(e),
        documentId:   issued.documentId,
        userId:       body.user_id,
        companyId:    issuerCompanyId,
      })
      // Non-fatal: document is already issued/signed
    }
  }

  return {
    success: true,
    document_id: issued.documentId,
    document_url: issued.documentUrl,
    vat: vatAmount,
  }
}
