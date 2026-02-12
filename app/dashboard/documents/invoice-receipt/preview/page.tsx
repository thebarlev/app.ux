import { Suspense } from "react"

export default function PreviewPage({ searchParams }: { searchParams: any }) {
  return (
    <Suspense fallback={<div className="p-4">טוען...</div>}>
      <PreviewFrame searchParams={searchParams} />
    </Suspense>
  )
}

async function PreviewFrame({ searchParams }: { searchParams: any }) {
  const params = await searchParams
  const documentId: string | null = params.documentId || params.document_id || params.id || null
  const language: "he" | "en" = params.language === "en" ? "en" : "he"

  if (!documentId) {
    return <div className="p-4">חסר `documentId`</div>
  }

  const safeId = encodeURIComponent(String(documentId))
  // Try to suppress browser PDF viewer chrome (works in some viewers).
  const pdfSrc = `/api/documents/${safeId}/pdf?issue=copy&lang=${language}&inline=1#toolbar=0&navpanes=0&scrollbar=0&zoom=page-width`
  const pdfDownload = `/api/documents/${safeId}/pdf?issue=copy&lang=${language}`

  return (
    <div className="p-4 space-y-3" dir={language === "en" ? "ltr" : "rtl"} style={{ background: "#FAF9F5", minHeight: "100vh" }}>
      <div
        style={{
          background: "#FEF9C3",
          border: "1px solid #FDE68A",
          color: "#92400E",
          padding: "10px 12px",
          borderRadius: 10,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        להמחשה בלבד
      </div>
      <div className="flex items-center gap-3">
        <a className="underline" href={pdfDownload} target="_blank" rel="noreferrer">
          הורד PDF
        </a>
        <span className="text-sm text-muted-fg">התצוגה כאן היא PDF זהה להורדה (inline)</span>
      </div>
      <div
        style={{
          width: "100%",
          height: "calc(100vh - 170px)",
          border: "none",
          borderRadius: 8,
          background: "#FAF9F5",
          overflow: "hidden",
        }}
      >
        <object
          title="Invoice receipt PDF preview"
          data={pdfSrc}
          type="application/pdf"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#FAF9F5",
          }}
        >
          <iframe
            title="Invoice receipt PDF preview fallback"
            src={pdfSrc}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "#FAF9F5",
            }}
          />
        </object>
      </div>
    </div>
  )
}
