import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const userClient = await createClient()
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = await params
  const { data: doc, error } = await userClient
    .from("documents")
    .select("id, document_status, language, original_issued_at, original_issued_language")
    .eq("id", documentId)
    .single()

  if (error || !doc) {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    documentId: doc.id,
    status: doc.document_status,
    baseLanguage: (doc as any).language || "he",
    originalIssuedAt: (doc as any).original_issued_at || null,
    originalIssuedLanguage: (doc as any).original_issued_language || null,
    originalIssued: !!(doc as any).original_issued_at,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const userClient = await createClient()
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = await params
  const body = await req.json().catch(() => ({} as any))
  const language: "he" | "en" = body?.language === "en" ? "en" : "he"  // Idempotent: mark only if not already issued.
  const nowIso = new Date().toISOString()
  const { data: existing, error: readErr } = await userClient
    .from("documents")
    .select("id, original_issued_at")
    .eq("id", documentId)
    .single()

  if (readErr || !existing) {
    return NextResponse.json({ ok: false, message: "Document not found" }, { status: 404 })
  }

  if ((existing as any).original_issued_at) {
    return NextResponse.json({ ok: true, alreadyIssued: true })
  }

  const { error: updErr } = await userClient
    .from("documents")
    .update({
      original_issued_at: nowIso,
      original_issued_language: language,
    })
    .eq("id", documentId)

  if (updErr) {
    return NextResponse.json({ ok: false, message: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, originalIssuedAt: nowIso, originalIssuedLanguage: language })
}
