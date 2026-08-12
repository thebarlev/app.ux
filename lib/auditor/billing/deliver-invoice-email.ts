/**
 * Deliver an issued invoice to the customer, and record that it happened.
 *
 * ── WHY THIS IS ITS OWN FUNCTION ────────────────────────────────────────────
 * Two callers need it and neither may drift from the other:
 *
 *   1. the issuance path, immediately after the RPC confirms a document
 *   2. the completion sweep in process-pending, for documents that have no
 *      'emailed' event yet
 *
 * The second exists because the first can fail — and did, on invoice 1003, where the
 * PDF call was made with the wrong option and the customer got nothing. Without the
 * sweep, the thank-you page's "החשבונית תישלח תוך מספר דקות" is a promise with no
 * mechanism behind it, which is the same class of lie the page was just fixed for.
 *
 * ── THE QUEUE IS DERIVED, NOT MAINTAINED ────────────────────────────────────
 * There is no queue table and no status column. "Issued invoices with no 'emailed'
 * event" IS the queue: it is a fact about the data, so it cannot drift from reality,
 * cannot be left holding stale rows, and needs no migration. A document leaves the queue
 * by being delivered, which is the same event the success page reads.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendAuditorInvoiceToCustomer } from "@/lib/email/auditorInvoiceEmail"
import { generateDocumentPDF } from "@/lib/pdf-service"

export type DeliverResult = { sent: boolean; reason?: string }

export async function deliverAuditorInvoiceEmail(
  admin: SupabaseClient,
  params: {
    documentId: string
    documentNumber: string
    /** The address the buyer typed into the checkout form. */
    to: string
    isTest: boolean
    planName: string | null
    amount: number | null
    currency: string | null
    /** Owner of the document — the issuing dealer, which is what document_events records. */
    issuerCompanyId: string
  }
): Promise<DeliverResult> {
  const { documentId, documentNumber } = params
  try {
    let pdfBase64: string | null = null

    /*
     * ⛔ `mode: "final"`, and this is the line that failed on invoice 1003.
     *
     * pdf-service reads `options?.mode || "preview"`, so omitting mode asks for a DRAFT
     * render and the guard beneath it correctly refuses to write a preview into storage
     * (PREVIEW_MUST_USE_GENERATE_PREVIEW). `context` is derived FROM mode, so passing
     * context:"issue" alone was handing over the output of the mapping instead of its
     * input. The guard was right; the call was wrong.
     */
    const pdf = await generateDocumentPDF(documentId, {
      mode: "final",
      context: "issue",
      isIssuance: true,
    })

    if (pdf?.success && pdf.buffer) {
      // pdf.buffer is already a Buffer (lib/types/template.ts) — no re-wrapping.
      pdfBase64 = pdf.buffer.toString("base64")
    } else {
      console.error("[AUDITOR_NOTICE_FAILED] invoice PDF could not be generated", {
        documentId,
        documentNumber,
        error: (pdf as any)?.error || "no buffer",
      })
    }

    const email = await sendAuditorInvoiceToCustomer({
      to: params.to,
      isTest: params.isTest,
      invoiceNumber: documentNumber,
      planName: params.planName,
      amount: params.amount,
      currency: params.currency,
      pdfBase64,
    })

    if (!email.sent) {
      console.error("[AUDITOR_NOTICE_FAILED] the customer did not get their invoice", {
        documentId,
        documentNumber,
        to: params.to,
        reason: email.reason,
      })
      return { sent: false, reason: email.reason }
    }

    /*
     * Recorded as a document event, not as a new column.
     *
     * document_events exists from migration 006 and 'emailed' has been in its check
     * constraint since — extended but never narrowed by 034 — so the fact the success
     * page needs is storable with no schema change at all.
     *
     * This row is also what removes the document from the sweep's queue, so writing it
     * matters twice: once for what the customer is told, once so we stop retrying.
     *
     * performed_by stays null. Nobody performed this; the system did.
     */
    const { error: evErr } = await admin.from("document_events").insert({
      document_id: documentId,
      company_id: params.issuerCompanyId,
      event_type: "emailed",
      event_data: {
        to: params.to,
        invoice_number: documentNumber,
        is_test: params.isTest,
        channel: "auditor_checkout",
      },
    } as any)

    if (evErr) {
      /*
       * ⚠️ The worst outcome in this function, and it is worth naming precisely: the
       * email went out and the record of it did not. The customer HAS the invoice, the
       * success page will tell them it is coming, and the sweep will send it again on
       * its next pass — a duplicate, not a loss.
       *
       * Duplicate over silence is the right way round: a second copy of your own invoice
       * is confusing, never having received it is a compliance problem. But it is logged
       * loudly because it is the only thing standing between one duplicate and a loop.
       */
      console.error("[AUDITOR_NOTICE_FAILED] invoice was emailed but the event was not recorded", {
        documentId,
        documentNumber,
        error: String((evErr as any)?.message || evErr),
      })
      return { sent: true, reason: "event_not_recorded" }
    }

    console.log("[AUDITOR_INVOICE_EMAILED]", { documentId, documentNumber, isTest: params.isTest })
    return { sent: true }
  } catch (e: any) {
    // Cannot propagate. The caller may be mid-issuance with a charge, a subscription and
    // a tax document already committed, none of which an email may undo.
    console.error("[AUDITOR_NOTICE_FAILED] invoice delivery threw", {
      documentId,
      documentNumber,
      error: String(e?.message || e),
    })
    return { sent: false, reason: "threw" }
  }
}
