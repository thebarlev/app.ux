import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { renderDeterministicPdfBytes } from "@/lib/pdf-service"
import { createSigningRequest, sha256Hex } from "@/lib/documents/signing/secure-signature-client"
import { logVowBillingFailure } from "@/lib/billing/vow-billing/log-failure"
import type { BillingProvider, IssueDocumentParams, IssueDocumentResult } from "@/lib/billing/vow-billing/providers/types"
import { DocIssueTracker, hostFromUrl } from "@/lib/diagnostics/external-services-check"

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
    // Reuse caller's attempt_id when threaded through metadata; otherwise
    // create a local tracker so internal-provider always logs with a
    // correlation id (e.g. when called from a non-instrumented entrypoint).
    const callerAttemptId =
      typeof (params.metadata as any)?.attempt_id === "string" && (params.metadata as any).attempt_id
        ? String((params.metadata as any).attempt_id)
        : undefined
    const tracker = new DocIssueTracker(callerAttemptId)

    const issuerCompanyId = String(process.env.VOW_BILLING_COMPANY_ID || "").trim()
    if (!issuerCompanyId) {
      tracker.fail("internal_provider_entry", new Error("missing_VOW_BILLING_COMPANY_ID"))
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

    const customerEmail = params.customer?.email ? String(params.customer.email).trim() : ""
    const customerPhone = params.customer?.phone ? String(params.customer.phone).trim() : ""
    // Prefer explicit name; otherwise email; otherwise the generic fallback.
    const customerName =
      (params.customer?.name && String(params.customer.name).trim()) ||
      customerEmail ||
      "Customer"

    // 0) Customer register: resolve the buyer to a customers row.
    //
    // This path has no tax id — BillingProviderCustomer is { name?, email,
    // country, phone? } (providers/types.ts:3-8) — so match key 1 is never
    // available. It always has an email, which the type makes REQUIRED, so it
    // lands on key 2 and never reaches the exact-name key. That matters here
    // specifically: this is the path that falls back to the literal "Customer"
    // when there is no name (see below), and matching on that name would glue
    // unrelated buyers into one customer row. Because the email decides first,
    // it cannot.
    //
    // FAILS OPEN, unlike the form path. A customer has already been charged by
    // the time this runs; a paid customer with no document is worse than a
    // document with a null customer_id, which is a row we can repair later. The
    // failure is logged so it is repairable rather than invisible.
    let resolvedCustomerId: string | null = null
    {
      const rc = await admin.rpc("resolve_customer", {
        p_company_id: issuerCompanyId,
        p_name:       customerName,
        p_tax_id:     null,
        p_email:      customerEmail || null,
      })

      if (rc.error || !rc.data) {
        tracker.fail("resolve_customer", new Error(rc.error?.message || "resolve_customer_returned_null"), {
          company_id: issuerCompanyId,
        })
        console.error("[VOW_BILLING][INTERNAL_PROVIDER] resolve_customer failed — issuing without a customer_id", {
          code:    rc.error?.code,
          message: rc.error?.message,
        })
        await logVowBillingFailure({
          stage:        "vow_create_document_resolve_customer",
          errorCode:    rc.error?.code ?? "resolve_customer_returned_null",
          errorMessage: rc.error?.message ?? "resolve_customer returned no id",
          errorDetails: { rpc: "resolve_customer" },
          documentId:   null,
          userId:       (params.metadata as any)?.user_id ?? null,
          companyId:    issuerCompanyId,
        })
      } else {
        resolvedCustomerId = String(rc.data)
      }
    }

    // 1) Create draft document (service role)
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .insert({
        company_id: issuerCompanyId,
        document_type: dbDocumentType,
        document_status: "draft",
        document_number: null,
        customer_id: resolvedCustomerId,
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
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
      tracker.fail("draft_inserted", docErr ?? new Error("no_doc_returned"), {
        company_id: issuerCompanyId,
      })
      console.error("[VOW_BILLING][INTERNAL_PROVIDER] failed to create draft document", { error: docErr })
      return { ok: false, error: "Failed to create document" }
    }

    const documentId = String(doc.id)
    tracker.step("draft_inserted", {
      document_id: documentId,
      company_id: issuerCompanyId,
      document_type: dbDocumentType,
      language,
    })

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

    // 3) Insert TWO document_line_items rows:
    //
    //   - line 1: the ITEM (kind="item")     → renders in "פירוט פריטים"
    //   - line 2: the PAYMENT (kind="payment")→ renders in "פירוט תקבולים"
    //
    // Why both: pdf-service.ts splits document_line_items by the
    // payment_metadata.kind discriminator (see hasKindDiscriminator
    // in pdf-service.ts ~line 1134). If we insert only one row,
    // the template falls back to showing the same line in BOTH
    // sections — which caused receipts to be misreported as the
    // net subtotal instead of the gross amount the customer paid.
    //
    // BKMV / receipt compliance: the receipts total MUST equal the
    // amount actually charged on Cardcom (`totalAmount` = gross,
    // including VAT). VAT is internal accounting; the customer paid
    // the full sum.
    const itemDescription =
      (params.productName && String(params.productName).trim()) ||
      (language === "he" ? "מיאושי - עולם הזוגיות" : "Mioshy — Relationship Hub")
    const paymentMethodLabel =
      (params.paymentMethod && String(params.paymentMethod).trim()) ||
      (language === "he" ? "כרטיס אשראי" : "Credit card")

    try {
      // line 1 — ITEM (net before VAT)
      await admin.from("document_line_items").insert({
        document_id: documentId,
        company_id: issuerCompanyId,
        line_number: 1,
        description: itemDescription,
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
          kind: "item",
          billing_user_id: params.metadata?.user_id || null,
          billing_email: params.customer?.email || null,
          billing_country: params.customer?.country || null,
          vat_rate: vatRate,
        },
      } as any)

      // line 2 — PAYMENT (gross amount actually charged)
      await admin.from("document_line_items").insert({
        document_id: documentId,
        company_id: issuerCompanyId,
        line_number: 2,
        description: paymentMethodLabel,
        item_date: todayYmdUtc(),
        unit_price: totalAmount,
        quantity: 1,
        line_total: totalAmount,
        currency: params.currency,
        bank_name: null,
        branch: null,
        account_number: null,
        item_sku: null,
        payment_metadata: {
          kind: "payment",
          billing_user_id: params.metadata?.user_id || null,
          billing_email: params.customer?.email || null,
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
    tracker.step("pdf_render_start", {
      document_id: documentId,
      pdf_render_host: hostFromUrl(process.env.PDF_RENDER_URL),
      pdf_render_token_present: !!String(process.env.PDF_RENDER_TOKEN || "").trim(),
    })
    let rendered: Awaited<ReturnType<typeof renderDeterministicPdfBytes>>
    try {
      rendered = await renderDeterministicPdfBytes({
        documentId,
        language,
        documentCopyLabel: label,
        attemptId: tracker.attemptId,
      } as any)
    } catch (e: any) {
      tracker.fail("pdf_render_failed", e, {
        document_id: documentId,
        pdf_render_host: hostFromUrl(process.env.PDF_RENDER_URL),
      })
      throw e
    }
    if (!rendered.ok) {
      tracker.fail("pdf_render_failed", new Error(rendered.message), {
        document_id: documentId,
        pdf_render_host: hostFromUrl(process.env.PDF_RENDER_URL),
      })
      console.error("[VOW_BILLING][INTERNAL_PROVIDER] PDF render failed", { documentId, message: rendered.message })
      return { ok: false, error: rendered.message }
    }
    tracker.step("pdf_render_ok", {
      document_id: documentId,
      pdf_bytes: rendered.pdfBytes.length,
      pdf_sha256_8: String(rendered.pdfSha256 || "").slice(0, 8),
    })

    // 5) Sign PDF (secure-signature service)
    //
    // Optional bypass: when SECURE_SIGNATURE_BYPASS=true the document
    // is uploaded UNSIGNED. Use this only when the signing service is
    // unavailable (e.g. dev / migration window). Resulting documents
    // have signed_pdf_sha256=NULL and signature_provider=NULL — the
    // repair-missing-invoices cron should re-attempt signing once the
    // service is back. This is NOT compliant for issued tax invoices
    // and must NOT remain enabled in production.
    const bypassSigning = String(process.env.SECURE_SIGNATURE_BYPASS || "").toLowerCase() === "true"

    if (bypassSigning) {
      tracker.step("sign_request_bypassed", { document_id: documentId })
    } else {
      tracker.step("sign_request_start", {
        document_id: documentId,
        secure_signature_host: hostFromUrl(process.env.SECURE_SIGNATURE_BASE_URL),
        secure_signature_api_key_present: !!String(process.env.SECURE_SIGNATURE_API_KEY || "").trim(),
      })
    }

    let signing: Awaited<ReturnType<typeof createSigningRequest>> | null = null
    if (!bypassSigning) {
      try {
        signing = await createSigningRequest({
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
            attempt_id: tracker.attemptId,
          },
          pdfBytes: rendered.pdfBytes,
          attemptId: tracker.attemptId,
        } as any)
      } catch (e: any) {
        tracker.fail("sign_request_failed", e, {
          document_id: documentId,
          secure_signature_host: hostFromUrl(process.env.SECURE_SIGNATURE_BASE_URL),
        })
        throw e
      }
    }

    if (signing && !signing.ok) {
      tracker.fail("sign_request_failed", new Error(signing.message), {
        document_id: documentId,
        secure_signature_host: hostFromUrl(process.env.SECURE_SIGNATURE_BASE_URL),
        sign_code: signing.code,
        sign_status: signing.status ?? null,
      })
      console.error("[VOW_BILLING][INTERNAL_PROVIDER] signing failed", {
        documentId,
        code: signing.code,
        message: signing.message,
        status: signing.status,
      })
      return { ok: false, error: `signing_failed:${signing.code}` }
    }
    if (signing && signing.ok) {
      tracker.step("sign_request_ok", {
        document_id: documentId,
        signed_pdf_bytes: signing.signedPdfBytes.length,
        request_id: signing.requestId ?? null,
      })
    }

    if (bypassSigning) {
      console.warn("[VOW_BILLING][INTERNAL_PROVIDER] SECURE_SIGNATURE_BYPASS=true — uploading UNSIGNED PDF (NOT compliant for tax invoices)", {
        documentId,
      })
      await logVowBillingFailure({
        stage:        "vow_create_document_persist",
        errorCode:    "signing_bypassed",
        errorMessage: "SECURE_SIGNATURE_BYPASS env var enabled — document is unsigned",
        documentId,
        userId:       (params.metadata as any)?.user_id ?? null,
        companyId:    issuerCompanyId,
      })
    }

    // Use signed bytes if signing succeeded; otherwise the rendered PDF as-is.
    const pdfBytesToUpload: Uint8Array = signing
      ? Uint8Array.from(signing.signedPdfBytes)
      : Uint8Array.from(rendered.pdfBytes)
    const signedPdfSha256: string | null = signing ? sha256Hex(signing.signedPdfBytes) : null
    const storageKey = `vow-billing/${documentId}/${language}.pdf`

    // 6) Upload to secure bucket (private)
    tracker.step("upload_start", {
      document_id: documentId,
      storage_key: storageKey,
      pdf_bytes: pdfBytesToUpload.length,
    })
    const up = await admin.storage
      .from(SECURE_ASSETS_BUCKET)
      .upload(storageKey, pdfBytesToUpload, { contentType: "application/pdf", upsert: false })

    if (up.error) {
      const msg = String(up.error.message || "")
      if (!msg.toLowerCase().includes("already exists") && !msg.toLowerCase().includes("duplicate")) {
        tracker.fail("upload_failed", up.error, { document_id: documentId, storage_key: storageKey })
        console.error("[VOW_BILLING][INTERNAL_PROVIDER] storage upload failed", { documentId, error: up.error })
        return { ok: false, error: "upload_failed" }
      }
      tracker.step("upload_already_exists", { document_id: documentId, storage_key: storageKey })
    } else {
      tracker.step("upload_ok", { document_id: documentId, storage_key: storageKey })
    }

    // 7) Persist signing metadata + mark final (best-effort finalize RPC)
    try {
      await admin
        .from("documents")
        .update({
          pdf_sha256: rendered.pdfSha256,
          signed_pdf_sha256: signedPdfSha256,
          signed_at: signing ? nowIso : null,
          signature_provider: signing ? "secure_signature" : null,
          pdf_storage_key: storageKey,
        } as any)
        .eq("id", documentId)
        .eq("company_id", issuerCompanyId)
    } catch {
      // ignore
    }

    tracker.step("finalize_start", { document_id: documentId, total_amount: totalAmount })
    const finalized = await finalizeViaServiceRpc({
      admin,
      companyId: issuerCompanyId,
      documentId,
      nowIso,
      totalAmount,
    })

    if (!finalized.ok) {
      tracker.fail("finalize_failed", new Error(finalized.message), {
        document_id: documentId,
        rpc_code: finalized.code,
      })
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
        tracker.fail("finalize_fallback_failed", new Error(fb.message ?? "fallback_failed"), {
          document_id: documentId,
        })
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
      } else {
        tracker.step("finalize_fallback_ok", { document_id: documentId })
      }
    } else {
      tracker.step("finalize_ok", { document_id: documentId })
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
      signedPdfBase64: signing ? signing.signedPdfBytes.toString("base64") : null,
      providerJson: {
        storage_key: storageKey,
        signing_request_id: signing ? signing.requestId : null,
        signing_bypassed: !signing,
        idempotent_orphan: canonicalDocumentId !== documentId ? documentId : null,
      },
    }
  },
}

