import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * API Route: Download PDF for a finalized document
 * GET /api/documents/[documentId]/pdf
 * 
 * ONE SOURCE OF TRUTH: Server-side only PDF generation and storage.
 * 
 * Uses two Supabase clients:
 * - userClient: Only for authentication (auth.getUser())
 * - adminClient: For all storage operations (createSignedUrl, generateDocumentPDF)
 * 
 * Flow:
 * 1. Authenticate user with userClient
 * 2. Fetch document metadata with userClient (RLS applies)
 * 3. If pdf_storage_key exists: Create signed URL with adminClient (bypasses RLS)
 * 4. If pdf_storage_key missing: Generate PDF with adminClient (idempotent fallback)
 * 5. Return signed URL redirect
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const startedAt = Date.now()
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:12',message:'PDF API - entry',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  try {
    // Create two clients: userClient for auth, adminClient for storage operations
    const userClient = await createClient()
    let adminClient: ReturnType<typeof createAdminClient>
    
    try {
      adminClient = createAdminClient()
    } catch (adminError: any) {
      // If admin client creation fails, it means env variables are missing
      console.error("[PDF API] Failed to create admin client:", adminError.message)
      return NextResponse.json(
        {
          error: "Server configuration error",
          code: "MISSING_ENV_VARIABLES",
          details: adminError.message || "Missing required environment variables for admin client. Please check your .env.local file and restart the server.",
        },
        { status: 500 }
      )
    }

    // 1) אימות משתמש (using userClient only)
    const { data: auth, error: authError } = await userClient.auth.getUser()
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:20',message:'PDF API - after auth',data:{hasAuth:!!auth?.user,hasError:!!authError,userId:auth?.user?.id?.substring(0,8)||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (authError || !auth?.user) {
      console.error("[PDF] Unauthorized:", { authError, documentId: (await params).documentId })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { documentId } = await params
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:28',message:'PDF API - after params',data:{documentId:documentId?.substring(0,8)||'MISSING'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    console.log("[PDF] Start:", { documentId, userId: auth.user.id })

    // 2) שליפת storageKey מה-DB (using userClient - RLS applies)
    const { data: doc, error: docError } = await userClient
      .from("documents")
      .select("id, document_type, document_status, document_number, pdf_storage_key, company_id")
      .eq("id", documentId)
      .single()

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:37',message:'PDF API - after DB query',data:{hasDoc:!!doc,hasError:!!docError,errorMessage:docError?.message||'N/A',hasStorageKey:!!doc?.pdf_storage_key,storageKey:doc?.pdf_storage_key||'N/A',status:doc?.document_status||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (docError || !doc) {
      console.error("[PDF] Document lookup failed:", { docError, documentId })
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Regulatory check: Only allow PDF download for finalized or pdf_ready documents
    if (doc.document_status !== "final" && doc.document_status !== "pdf_ready") {
      return NextResponse.json(
        { error: "PDF can only be downloaded for finalized documents" },
        { status: 400 }
      )
    }

    // 3) אם יש pdf_storage_key - יצירת Signed URL (העדיפות הראשונה)
    const storageKey = doc.pdf_storage_key
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:50',message:'PDF API - checking storageKey',data:{hasStorageKey:!!storageKey,storageKey:storageKey||'N/A',status:doc.document_status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
    // #endregion
    
    // CRITICAL: Only serve existing PDFs - no generation on download
    if (!storageKey) {
      console.error(`[PDF API] PDF not available for document: ${documentId} - pdf_storage_key is missing`)
      return NextResponse.json(
        {
          error: "PDF not available yet",
          code: "PDF_NOT_AVAILABLE",
          details: "This document's PDF has not been generated yet. Please finalize the document first or contact support if the document is already finalized."
        },
        { status: 404 }
      )
    }
    
    // אם יש storageKey - מיד מחזירים Signed URL (לא מייצרים מחדש)
    console.log("[PDF] Found existing storageKey, creating Signed URL:", storageKey)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:58',message:'PDF API - creating signed URL for existing PDF',data:{storageKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
    // #endregion
    
    // Use adminClient for createSignedUrl to bypass RLS on private storage bucket
    const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
      .from("business-assets")
      .createSignedUrl(storageKey, 120)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:64',message:'PDF API - signed URL result',data:{hasSignedUrl:!!signedUrlData?.signedUrl,hasError:!!signedUrlError,errorMessage:signedUrlError?.message||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
    // #endregion
    
    if (signedUrlError || !signedUrlData?.signedUrl) {
      // אם Signed URL נכשל - שגיאה
      console.error("[PDF] Signed URL failed for existing PDF:", signedUrlError)
      return NextResponse.json(
        { 
          error: signedUrlError?.message ?? "Signed URL failed",
          code: "SIGNED_URL_FAILED",
          details: "Failed to create signed URL for PDF download. Please try again or contact support."
        },
        { status: 500 }
      )
    }
    
    // Fetch the PDF from signed URL and return it as a blob
    // This ensures the browser downloads the file directly instead of navigating to the signed URL
    console.log(`[PDF API] ✅ Fetching PDF from signed URL for document ${documentId}:`, { ms: Date.now() - startedAt })
    
    const pdfResponse = await fetch(signedUrlData.signedUrl)
    
    if (!pdfResponse.ok) {
      console.error(`[PDF API] Failed to fetch PDF from signed URL for document ${documentId}:`, pdfResponse.status, pdfResponse.statusText)
      return NextResponse.json(
        { 
          error: "Failed to fetch PDF",
          code: "PDF_FETCH_FAILED",
          details: "Could not retrieve PDF from storage. Please try again or contact support."
        },
        { status: 500 }
      )
    }
    
    const pdfBlob = await pdfResponse.blob()
    
    // Return PDF as blob with proper headers for download
    const fileName = `receipt-${doc.document_number || documentId}.pdf`
    console.log(`[PDF API] ✅ Returning PDF blob for document ${documentId}, size: ${pdfBlob.size} bytes, filename: ${fileName}`)
    
    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBlob.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (e: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/documents/[documentId]/pdf/route.ts:100',message:'PDF API - catch block',data:{errorMessage:e?.message||'N/A',errorStack:e?.stack?.substring(0,200)||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    console.error("[PDF] Route crashed:", e?.stack || e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
