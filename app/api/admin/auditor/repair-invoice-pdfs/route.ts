/**
 * Admin-only: Regenerate PDFs for auditor invoices that don't have them.
 * POST /api/admin/auditor/repair-invoice-pdfs
 * Body: { documentId?: string } — if omitted, repairs all auditor invoices missing PDF
 *
 * Fixes PDF_NOT_AVAILABLE for invoices created before process-indicator-event
 * started generating PDFs.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { getAuditorConfig } from "@/lib/auditor/env"
import { generateDocumentPDF } from "@/lib/pdf-service"

export async function POST(req: Request) {
  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const documentId = typeof body?.documentId === "string" ? body.documentId.trim() : null

  const admin = createServiceRoleClient()

  let docIds: string[] = []
  if (documentId) {
    const { data: doc } = await admin
      .from("documents")
      .select("id, reference_text")
      .eq("id", documentId)
      .single()
    if (doc && String((doc as any)?.reference_text || "").startsWith("auditor_charge:")) {
      docIds = [documentId]
    } else {
      return NextResponse.json({ error: "Document not found or not an auditor invoice" }, { status: 404 })
    }
  } else {
    const { data: docs } = await admin
      .from("documents")
      .select("id, pdf_storage_key")
      .like("reference_text", "auditor_charge:%")
    docIds = (docs || [])
      .filter((d: any) => !d?.pdf_storage_key || String(d.pdf_storage_key).trim() === "")
      .map((d: any) => d.id)
      .filter(Boolean)
  }

  const results: { documentId: string; ok: boolean; error?: string }[] = []

  for (const docId of docIds) {
    try {
      const [origRes, copyRes] = await Promise.allSettled([
        generateDocumentPDF(docId, {
          language: "he",
          mode: "recovery",
          context: "issue",
          variant: "original",
          isIssuance: true,
          requestId: `repair-orig-${docId}`,
        }),
        generateDocumentPDF(docId, {
          language: "he",
          mode: "recovery",
          context: "download",
          variant: "copy",
          isIssuance: true,
          requestId: `repair-copy-${docId}`,
        }),
      ])
      const origOk = origRes.status === "fulfilled" && origRes.value?.success
      const copyOk = copyRes.status === "fulfilled" && copyRes.value?.success
      const ok = origOk || copyOk
      const error =
        !ok && origRes.status === "fulfilled"
          ? origRes.value?.error
          : !ok && copyRes.status === "fulfilled"
            ? copyRes.value?.error
            : origRes.status === "rejected"
              ? String((origRes as PromiseRejectedResult).reason)
              : copyRes.status === "rejected"
                ? String((copyRes as PromiseRejectedResult).reason)
                : undefined
      results.push({ documentId: docId, ok, error })
    } catch (e: any) {
      results.push({ documentId: docId, ok: false, error: String(e?.message || e) })
    }
  }

  const repaired = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  return NextResponse.json({
    ok: failed.length === 0,
    repaired,
    total: docIds.length,
    failed: failed.length,
    results,
  })
}
