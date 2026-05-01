import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { renderDeterministicPdfBytes } from "@/lib/pdf-service"
import { createSigningRequest, sha256Hex } from "@/lib/documents/signing/secure-signature-client"
import { logVowBillingFailure } from "@/lib/billing/vow-billing/log-failure"
import type { BillingProvider, IssueDocumentParams, IssueDocumentResult } from "@/lib/billing/vow-billing/providers/types"

function todayYmdUtc(): string {
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function clampMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Number(Number(n).toFixed(2))
}

/**
 * Finalize a billing document via the service-role RPC.
 *
 * IMPORTANT — context for future maintainers:
 * The legacy RPC `finalize_document_with_period_guard` is gated by
 * `auth.uid() is not null`. When this code path is invoked from
 * `/api/billing/create-document` (server-to-server, with the Supabase
 * service-role key), there is no user session and `auth.uid()` is NULL.
 * That made the legacy RPC always return 'unauthorized' and forced us
 * onto a partial-fallback UPDATE that did NOT populate the accounting
 * fields, breaking BKMV/reports/reconciliation.
 *
 * The new RPC `finalize_document_with_period_guard_service` is
 * SECURITY DEFINER, restricted to service_role JWT, and atomically
 * updates ALL accounting fields. See scripts/107-...sql.
 */
async function finalizeViaServiceRpc(params: {
  admin: ReturnType<typeof createAdminClient>
  companyId: string
  documentId: string
  nowIso: string
  totalAmount: number
}): Promise<{ ok: true; reason?: string | null } | { ok: false; code: string; message: string }> {
  const { admin, companyId, documentId, nowIso, totalAmount } = params
  try {
    const r = await admin.rpc("finalize_document_with_period_guard_service", {
      p_company_id:           companyId,
      p_document_id:          documentId,
      p_paid_amount:          clampMoney(totalAmount),
      p_credited_amount:      clampMoney(totalAmount),
      p_outstanding_balance:  0,
      p_accounting_status:    "paid",
      p_now:                  nowIso,
    } as any)

    if (r.error) {
      return { ok: false, code: "rpc_error", message: r.error.message || "rpc_error" }
    }
    const row = Array.isArray(r.data) ? (r.data[0] as any) : (r.data as any)
    if (row?.ok !== true) {
      return { ok: false, code: String(row?.reason || "finalize_failed"), message: String(row?.reason || "finalize_failed") }
    }
    return { ok: true, reason: row?.reason ?? null }
  } catch (e: any) {
    return { ok: false, code: "rpc_threw", message: e?.message || "finalize_rpc_failed" }
  }
}

/**
 * Last-resort fallback when the service RPC is unavailable (e.g.
 * migration 107 not yet applied). Updates ALL accounting fields, not
 * just `document_status`. Idempotent: only acts on draft rows.
 */
async function finalizeFallbackFullAccounting(params: {
  admin: ReturnType<typeof createAdminClient>
  companyId: string
  documentId: string
  nowIso: string
  totalAmount: number
}): Promise<{ ok: boolean; message?: string }> {
  const { admin, companyId, documentId, nowIso, totalAmount } = params
  const paid = clampMoney(totalAmount)
  try {
    const upd = await admin
      .from("documents")
      .update({
        document_status:     "final",
        finalized_at:        nowIso,
        finalized_by:        null,
        paid_amount:         paid,
        credited_amount:     paid,
        outstanding_balance: 0,
        accounting_status:   "paid",
      } as any)
      .eq("id", documentId)
      .eq("company_id", companyId)
      .eq("document_status", "draft")
      .select("id")
      .maybeSingle()

    if (upd.error) return { ok: false, message: upd.error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message || "fallback_update_failed" }
  }
}

export const internalBillingProvider: BillingProvider = {
  name: "internal",

  async issueDocument(params: IssueDocumentParams): Promise<IssueDocumentResult> {
    const issuerCompanyId = String(process.env.VOW_BILLING_COMPANY_ID || "").trim()
    if (!issuerCompanyId) {
      return { ok: false, error: "Missing VOW_BILLING_COMPANY_ID" }
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    const language: "he" | "en" = params.language === "en" ? "en" : "he"
    const dbDocumentType = "invoice_receipt"

    const amount = clampMoney(params.amount)
    const vatAmount = clampMoney(params.vatAmount)
    const totalAmount = clampMoney(params.totalAmount)
    const subtotal = clampMoney(totalAmount - vatAmount)
    const vatRate = clampMoney(params.vatRate)

    const customerName =
      (params.customer?.name && String(params.customer.name).trim()) ||
      (params.customer?.email ? String(params.customer.email).trim() : "") ||
      "Customer"

    // 1) Create draft document (service role)
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .insert({
        company_id: issuerCompanyId,
        document_type: dbDocumentType,
        document_status: "draft",
        document_number: null,
        customer_id: null,
        customer_name: customerName,
        issue_date: todayYmdUtc(),
        total_amount: totalAmount,
        currency: params.currency,
        internal_notes: null,
        language,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        pdf_generated_at: nowIso,
      } as any)
      .select("id, document_number")
      .single()

    if (docErr || !doc?.id) {
      console.error("[VOW_BILLING][INTERNAL_PROVIDER] failed to create draft document", { error: docErr })
      return { ok: false, error: "Failed to create document" }
    }

    const documentId = String(doc.id)

    // 2) Reserve a document number (best-effort; templates/signing use it when present)
    try {
      const rpc = await admin.rpc("generate_document_number", {
        p_company_id: issuerCompanyId,
        p_document_type: dbDocumentType,
      } as any)
      if (!rpc.error && rpc.data) {
        await admin
          .from("documents")
          .update({ document_number: rpc.data } as any)
          .eq("id", documentId)
          .eq("company_id", issuerCompanyId)
          .eq("document_status", "draft")
      }
    } catch {
      // ignore
    }

    // 3) Insert a single line item (required by some templates and downstream logic)
    try {
      const lineDesc =
        language === "he"
          ? "שירות SaaS (Uxellent)"
          : "SaaS service (Uxellent)"

      await admin.from("document_line_items").insert({
        document_id: documentId,
        company_id: issuerCompanyId,
        line_number: 1,
        description: lineDesc,
        item_date: todayYmdUtc(),
        unit_price: subtotal,
        quantity: 1,
        line_total: subtotal,
        currency: params.currency,
        bank_name: null,
        branch: null,
        account_number: null,
        item_sku: null,
        payment_metadata: {
          billing_user_id: params.metadata?.user_id || null,
          billing_email: params.customer?.email || null,
          billing_country: params.customer?.country || null,
          vat_rate: vatRate,
        },
      } as any)
    } catch (e: any) {
      console.warn("[VOW_BILLING][INTERNAL_PROVIDER] failed to insert document_line_items (continuing)", {
        documentId,
        error: e?.message || String(e),
      })
    }

    // 4) Render deterministic PDF (requires pdf_generated_at)
    const label = language === "he" ? "מקור" : "Original"
    const rendered = await renderDeterministicPdfBytes({
      documentId,
      language,
      documentCopyLabel: label,
    })
    if (!rendered.ok) {
      console.error("[VOW_BILLING][INTERNAL_PROVIDER] PDF render failed", { documentId, message: rendered.message })
      return { ok: false, error: rendered.message }
    }

    // 5) Sign PDF (secure-signature service)
    const signing = await createSigningRequest({
      businessId: issuerCompanyId,
      externalDocId: `${documentId}:vow_billing:${language}`,
      supplierName: "VOW Billing",
      businessName: "Uxellent",
      businessTaxId: null,
      businessContactName: null,
      businessEmail: null,
      metadata: {
        ...params.metadata,
        document_id: documentId,
        issuer_company_id: issuerCompanyId,
        country: params.customer?.country,
        email: params.customer?.email,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        amount,
        total_amount: totalAmount,
      },
      pdfBytes: rendered.pdfBytes,
    })

    if (!signing.ok) {
      console.error("[VOW_BILLING][INTERNAL_PROVIDER] signing failed", {
        documentId,
        code: signing.code,
        message: signing.message,
        status: signing.status,
      })
      return { ok: false, error: `signing_failed:${signing.code}` }
    }

    const signedPdfSha256 = sha256Hex(signing.signedPdfBytes)
    const storageKey = `vow-billing/${documentId}/${language}.pdf`

    // 6) Upload to secure bucket (private)
    const up = await admin.storage
      .from(SECURE_ASSETS_BUCKET)
      .upload(storageKey, Uint8Array.from(signing.signedPdfBytes), { contentType: "application/pdf", upsert: false })

    if (up.error) {
      const msg = String(up.error.message || "")
      if (!msg.toLowerCase().includes("already exists") && !msg.toLowerCase().includes("duplicate")) {
        console.error("[VOW_BILLING][INTERNAL_PROVIDER] storage upload failed", { documentId, error: up.error })
        return { ok: false, error: "upload_failed" }
      }
    }

    // 7) Persist signing metadata + mark final (best-effort finalize RPC)
    try {
      await admin
        .from("documents")
        .update({
          pdf_sha256: rendered.pdfSha256,
          signed_pdf_sha256: signedPdfSha256,
          signed_at: nowIso,
          signature_provider: "secure_signature",
          pdf_storage_key: storageKey,
        } as any)
        .eq("id", documentId)
        .eq("company_id", issuerCompanyId)
    } catch {
      // ignore
    }

    const finalized = await finalizeViaServiceRpc({
      admin,
      companyId: issuerCompanyId,
      documentId,
      nowIso,
      totalAmount,
    })

    if (!finalized.ok) {
      console.error("[VOW_BILLING][INTERNAL_PROVIDER] service finalize RPC failed", {
        documentId,
        code: finalized.code,
        message: finalized.message,
      })

      // Persist a structured failure record so monitoring/repair jobs see it.
      // Best-effort — never throws.
      await logVowBillingFailure({
        stage:        "vow_create_document_finalize",
        errorCode:    finalized.code,
        errorMessage: finalized.message,
        errorDetails: { rpc: "finalize_document_with_period_guard_service" },
        documentId,
        userId:       (params.metadata as any)?.user_id ?? null,
        companyId:    issuerCompanyId,
      })

      // Last-resort fallback: write ALL accounting fields directly.
      // The RPC may be missing (migration not applied) or transient — we
      // still must not produce a half-finalised document. If the fallback
      // also fails, the document remains a draft and the failure is logged
      // for the repair endpoint to pick up.
      const fb = await finalizeFallbackFullAccounting({
        admin,
        companyId: issuerCompanyId,
        documentId,
        nowIso,
        totalAmount,
      })
      if (!fb.ok) {
        console.error("[VOW_BILLING][INTERNAL_PROVIDER] fallback finalize also failed", {
          documentId,
          message: fb.message,
        })
        await logVowBillingFailure({
          stage:        "vow_create_document_finalize",
          errorCode:    "fallback_failed",
          errorMessage: fb.message ?? "fallback_failed",
          documentId,
          userId:       (params.metadata as any)?.user_id ?? null,
          companyId:    issuerCompanyId,
        })
      }
    }

    // 8) Return a signed URL for download
    let documentUrl: string | null = null
    try {
      const signed = await admin.storage.from(SECURE_ASSETS_BUCKET).createSignedUrl(storageKey, 60 * 60)
      if (!signed.error && signed.data?.signedUrl) documentUrl = String(signed.data.signedUrl)
    } catch {
      documentUrl = null
    }

    // 9) Persist the vow_billing_issued_documents row, keyed by the
    //    caller-supplied idempotency_key. Two scenarios:
    //
    //    A) idempotencyKey is set → we own the persist here so we can
    //       handle the unique-violation race (23505). When two callers
    //       passed the pre-flight check concurrently, both reach this
    //       point with finalized docs. ONE wins the unique constraint;
    //       the other re-fetches the winning row's document_id and
    //       returns IT — the loser's local document_id becomes an
    //       orphan that operators can sweep up later.
    //
    //    B) idempotencyKey is null → leave the persist to billing-service.ts
    //       (the legacy code path for callers that don't request
    //       idempotency).
    let canonicalDocumentId = documentId
    let canonicalDocumentUrl = documentUrl

    if (params.idempotencyKey) {
      try {
        const ins = await admin
          .from("vow_billing_issued_documents")
          .insert({
            user_id: (params.metadata as any)?.user_id ?? null,
            document_id: documentId,
            amount: clampMoney(amount),
            vat: clampMoney(vatAmount),
            country: params.customer?.country ?? "",
            currency: params.currency,
            language,
            provider: "internal",
            document_url: documentUrl,
            idempotency_key: params.idempotencyKey,
            created_at: new Date().toISOString(),
          } as any)
          .select("document_id")
          .single()

        if (ins.error) {
          // Postgres unique violation on (provider, idempotency_key)
          const code = (ins.error as any)?.code ?? ""
          if (code === "23505") {
            // Race winner already inserted. Find their document_id and
            // return that — our just-created doc_b is the orphan.
            const { data: winner } = await admin
              .from("vow_billing_issued_documents")
              .select("document_id")
              .eq("provider", "internal")
              .eq("idempotency_key", params.idempotencyKey)
              .maybeSingle()

            if (winner?.document_id) {
              canonicalDocumentId = String(winner.document_id)
              canonicalDocumentUrl = await (async () => {
                try {
                  const { data: winnerDoc } = await admin
                    .from("documents")
                    .select("pdf_storage_key")
                    .eq("id", canonicalDocumentId)
                    .maybeSingle()
                  if (!winnerDoc?.pdf_storage_key) return null
                  const signed = await admin.storage
                    .from(SECURE_ASSETS_BUCKET)
                    .createSignedUrl(String(winnerDoc.pdf_storage_key), 60 * 60)
                  return signed.error || !signed.data?.signedUrl
                    ? null
                    : String(signed.data.signedUrl)
                } catch {
                  return null
                }
              })()
              console.warn("[VOW_BILLING][INTERNAL_PROVIDER] idempotency race lost — returning canonical document", {
                idempotency_key: params.idempotencyKey,
                losing_document_id: documentId,
                canonical_document_id: canonicalDocumentId,
              })
              await logVowBillingFailure({
                stage:        "vow_create_document_persist",
                errorCode:    "idempotency_race_orphan",
                errorMessage: `lost the unique-index race; document ${documentId} is orphaned, canonical is ${canonicalDocumentId}`,
                documentId,
                userId:       (params.metadata as any)?.user_id ?? null,
                companyId:    issuerCompanyId,
                errorDetails: { canonical_document_id: canonicalDocumentId, idempotency_key: params.idempotencyKey },
              })
            } else {
              // Constraint hit but no row visible — concerning, but we
              // still have OUR finalized document, so return it.
              console.error("[VOW_BILLING][INTERNAL_PROVIDER] 23505 with no canonical row visible", {
                idempotency_key: params.idempotencyKey,
                documentId,
              })
            }
          } else {
            // Some other DB error. Document is finalized; this row
            // failure is non-fatal.
            console.error("[VOW_BILLING][INTERNAL_PROVIDER] failed to persist vow_billing_issued_documents", {
              documentId,
              error: ins.error.message,
              code,
            })
            await logVowBillingFailure({
              stage:        "vow_create_document_persist",
              errorCode:    "persist_failed",
              errorMessage: ins.error.message,
              documentId,
              userId:       (params.metadata as any)?.user_id ?? null,
              companyId:    issuerCompanyId,
            })
          }
        }
      } catch (e: any) {
        console.error("[VOW_BILLING][INTERNAL_PROVIDER] persist threw", {
          documentId,
          error: e?.message || String(e),
        })
        await logVowBillingFailure({
          stage:        "vow_create_document_persist",
          errorCode:    "persist_threw",
          errorMessage: e?.message || String(e),
          documentId,
          userId:       (params.metadata as any)?.user_id ?? null,
          companyId:    issuerCompanyId,
        })
      }
    }

    return {
      ok: true,
      documentId: canonicalDocumentId,
      documentUrl: canonicalDocumentUrl,
      signedPdfBase64: signing.signedPdfBytes.toString("base64"),
      providerJson: {
        storage_key: storageKey,
        signing_request_id: signing.requestId,
        idempotent_orphan: canonicalDocumentId !== documentId ? documentId : null,
      },
    }
  },
}

