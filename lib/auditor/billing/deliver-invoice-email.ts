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
import { SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"

export type DeliverResult = {
  sent: boolean
  reason?: string
  /** Size of the generated PDF. Reported so a staged run can prove a file was produced. */
  pdfBytes?: number | null
}

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
     * ⛔⛔ `mode: "recovery"` IS THE NORMAL PATH HERE. DO NOT "FIX" IT BACK TO "final".
     *
     * That change looks like a correction and breaks everything silently, so here is why
     * it is wrong, in order:
     *
     *   1. `mode: "preview"` (the default when mode is omitted) refuses outright:
     *      PREVIEW_MUST_USE_GENERATE_PREVIEW. That was the first failure, on invoice 1003.
     *
     *   2. `mode: "final"` does not GENERATE — it fetches a PDF that finalization is
     *      assumed to have already written, and returns PDF_MISSING_BUT_EXPECTED when the
     *      file is absent. That was the second failure, on all four invoices.
     *
     *   3. And it can never be right here, in any scenario. The issuance RPC marks the
     *      document `final` in SQL, in the same statement that creates it, before any
     *      TypeScript runs. So by the time this line executes — even on the very first
     *      attempt, milliseconds after issuance — the document is already final and its
     *      PDF has never existed. There is no ordering in which `final` finds a file.
     *
     * pdf-service says so itself, at the flag that allows this:
     *
     *     // Recovery mode: if storage is missing but PDF is "expected", we still want to
     *     // regenerate it. This is needed for auto-issued documents that were finalized
     *     // without generating/uploading PDFs.
     *     const allowRecoveryRegenerate = pdfMode === "recovery" && options?.isIssuance === true
     *
     * "auto-issued documents that were finalized without generating PDFs" is exactly what
     * every auditor invoice is. So `recovery` is not an emergency route we fell back to;
     * it is the only route that describes this flow, and `isIssuance: true` is required
     * alongside it or the flag stays false.
     *
     * ── WHY THIS CANNOT STAMP TODAY'S DATE ON AN OLD INVOICE ──────────────────
     * Verified before this was ever run against a real document, because a file that
     * disagrees with its own document row is worse than a missing file.
     *
     * Every date the template renders comes from the stored column, not from the clock:
     * pdf-service builds `issue_date`, `document_date`, `formatted_date`, `Datecreation`
     * and `DATE` all from `doc.issue_date`, and the template reads
     * `{{document.issue_date}}`. The two `new Date()` calls in that file are fallbacks of
     * the shape `iso ? new Date(iso) : new Date()` — reached only when the stored value is
     * empty.
     *
     * And it is not empty: the issuance function writes it, at scripts/133 line 326-327,
     * `v_cols := 'issue_date'` with `v_vals := 'current_date'` — evaluated once, at
     * issuance, and never again. The document number is likewise drawn from
     * document_sequences at issuance and stored.
     *
     * So a recovery render three days later produces the original date and the original
     * number, because both are read from the row rather than recomputed. The failure mode
     * to watch for is a document whose issue_date is NULL — then, and only then, the
     * fallback would use today. Nothing in this flow creates such a row.
     */
    const pdf = await generateDocumentPDF(documentId, {
      mode: "recovery",
      context: "issue",
      isIssuance: true,
    })

    if (pdf?.success && pdf.buffer) {
      // pdf.buffer is already a Buffer (lib/types/template.ts) — no re-wrapping.
      pdfBase64 = pdf.buffer.toString("base64")
    } else if (pdf?.success && !pdf.buffer && (pdf as any)?.storageKey) {
      /*
       * ⛔ SUCCESS WITH NO BUFFER MEANS THE FILE ALREADY EXISTS — NOT THAT IT FAILED.
       *
       * pdf-service short-circuits when the PDF is already in storage:
       *
       *     console.log("PDF already exists for document …, returning existing")
       *     return { success: true, path: storageKey, storageKey, buffer: undefined }
       *
       * The first version of this treated that as a failure, which broke the sweep in
       * exactly the case it exists for: attempt one generates the file and the email
       * fails, then every later attempt gets success-with-no-buffer, is read as "could
       * not be generated", and never sends. Invoice 1000 demonstrated it — 98,767 bytes
       * on the first pass, `null` and "no buffer" on the second.
       *
       * It did not show up on 1001/1002/1003 because those sent on their first attempt,
       * while the buffer was still in hand. The defect was waiting for the first email
       * failure.
       */
      const storageKey = String((pdf as any).storageKey)
      const { data: file, error: dlErr } = await (admin as any).storage
        .from(SECURE_ASSETS_BUCKET)
        .download(storageKey)

      if (dlErr || !file) {
        console.error("[AUDITOR_NOTICE_FAILED] the PDF exists in storage but could not be downloaded", {
          documentId,
          documentNumber,
          storageKey,
          error: dlErr ? String((dlErr as any)?.message || dlErr) : "no file",
        })
      } else {
        const bytes = Buffer.from(await file.arrayBuffer())
        /*
         * ⛔ A zero-length file passes `success` and would produce the same lie the
         * whole guard exists to prevent: an email that says the invoice is attached,
         * carrying nothing. "No PDF, no email" applies to a downloaded file exactly as
         * it applies to a generated one.
         */
        if (bytes.length === 0) {
          console.error("[AUDITOR_NOTICE_FAILED] the stored PDF is zero bytes — treating it as missing", {
            documentId,
            documentNumber,
            storageKey,
          })
        } else {
          pdfBase64 = bytes.toString("base64")
          console.log("[AUDITOR_INVOICE_PDF_FROM_STORAGE]", {
            documentId,
            documentNumber,
            storageKey,
            bytes: bytes.length,
          })
        }
      }
    } else {
      /*
       * Only NOW is "could not be generated" the truth. The message used to be printed
       * for a file that existed and was simply not returned inline, which is precisely
       * the kind of log line that sent us hunting the wrong thing all day: it reported
       * an assumption instead of what happened.
       */
      console.error("[AUDITOR_NOTICE_FAILED] invoice PDF could not be generated", {
        documentId,
        documentNumber,
        error: (pdf as any)?.error || "generator returned neither a buffer nor a storage key",
      })
    }

    /*
     * ⛔ A reserved-TLD address is skipped, not attempted.
     *
     * `.invalid` is reserved by RFC 2606 precisely so that it can never resolve. Mailing
     * it is not a delivery that might work — it is a guaranteed bounce, retried every
     * five minutes until the sweep window closes.
     *
     * ⚠️ Deliberately narrow: ONLY the reserved TLDs, never a guess about which real
     * addresses look plausible. test@sf.com is left to fail on its own, because logic
     * that decides who is "really" a customer is a worse bug than a few bounces.
     *
     * Placed AFTER the PDF is generated on purpose. The missing file is a defect in its
     * own right — every issued document should have one — and recovery mode WRITES it to
     * storage, so the next pass finds the file instead of regenerating it. Skipping
     * before this line would leave the document permanently without its PDF.
     */
    const RESERVED_TLDS = [".invalid", ".test", ".example", ".localhost"]
    const addr = String(params.to || "").trim().toLowerCase()
    if (RESERVED_TLDS.some((t) => addr.endsWith(t))) {
      console.warn("[AUDITOR_INVOICE_SKIPPED] reserved-TLD address, not deliverable", {
        documentId,
        documentNumber,
        to: params.to,
        pdfGenerated: Boolean(pdfBase64),
      })
      return { sent: false, reason: "skipped_undeliverable", pdfBytes: pdfBase64 ? Buffer.from(pdfBase64, "base64").length : null }
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
      return { sent: false, reason: email.reason, pdfBytes: pdfBase64 ? Buffer.from(pdfBase64, "base64").length : null }
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
    return { sent: true, pdfBytes: pdfBase64 ? Buffer.from(pdfBase64, "base64").length : null }
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
