import { NextRequest, NextResponse } from "next/server"
import { generatePreviewPDF } from "@/lib/pdf-service"

/**
 * API Route: Download PDF preview for a document
 * GET /api/documents/[documentId]/pdf
 * 
 * Returns PDF buffer with appropriate headers for download
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      )
    }

    // Generate PDF
    const result = await generatePreviewPDF(documentId)

    if (!result.success || !result.buffer) {
      return NextResponse.json(
        { error: result.error || "Failed to generate PDF" },
        { status: 500 }
      )
    }

    // Return PDF with download headers
    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document_${documentId}.pdf"`,
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("PDF API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
