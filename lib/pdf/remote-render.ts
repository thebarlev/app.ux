import { hostFromUrl } from "@/lib/diagnostics/external-services-check"

type RemotePdfRenderOptions = {
  format?: string
  printBackground?: boolean
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
  displayHeaderFooter?: boolean
  headerTemplate?: string
  footerTemplate?: string
  landscape?: boolean
  scale?: number
}

export type RemotePdfRenderPayload = {
  html: string
  css: string
  footer_html: string
  footer_css: string
  options?: RemotePdfRenderOptions
}

export async function renderPdfRemote(
  payload: RemotePdfRenderPayload,
  attemptId?: string,
): Promise<Buffer> {
    const controller = new AbortController();
    const t = setTimeout(
      () => controller.abort(),
      Number(process.env.PDF_RENDER_TIMEOUT_MS || 45000)
    );

    const renderHost = hostFromUrl(process.env.PDF_RENDER_URL)

    try {
      const t0 = Date.now()

      const url = `${process.env.PDF_RENDER_URL}/render`
      const baseHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.PDF_RENDER_TOKEN}`,
      }

      const body = JSON.stringify(payload)

      // Always-on diagnostic line (no payload, no token). attemptId is
      // optional; when absent we still want host/status visibility on
      // every render, since this is the most failure-prone hop.
      console.log("[DOC_ISSUE_PDF_FETCH]", {
        attempt_id: attemptId ?? null,
        phase: "start",
        pdf_render_host: renderHost,
        token_present: !!process.env.PDF_RENDER_TOKEN,
        payload_bytes: body.length,
      })

      let res: Response
      try {
        res = await fetch(url, {
          method: "POST",
          headers: baseHeaders,
          body,
          signal: controller.signal,
        })
      } catch (e: any) {
        console.error("[DOC_ISSUE_PDF_FETCH]", {
          attempt_id: attemptId ?? null,
          phase: "network_error",
          duration_ms: Date.now() - t0,
          pdf_render_host: renderHost,
          error_message: e?.message ?? String(e ?? ""),
          error_name: e?.name ?? null,
          error_code: e?.code ?? null,
        })
        throw e
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[DOC_ISSUE_PDF_FETCH]", {
          attempt_id: attemptId ?? null,
          phase: "http_error",
          duration_ms: Date.now() - t0,
          pdf_render_host: renderHost,
          http_status: res.status,
          body_snippet: typeof txt === "string" ? txt.slice(0, 300) : null,
        })
        throw new Error(`pdf_render_failed ${res.status} ${txt}`);
      }

      const buf = Buffer.from(await res.arrayBuffer())

      console.log("[DOC_ISSUE_PDF_FETCH]", {
        attempt_id: attemptId ?? null,
        phase: "ok",
        duration_ms: Date.now() - t0,
        pdf_render_host: renderHost,
        http_status: res.status,
        pdf_bytes: buf.length,
      })

      return buf
    } finally {
      clearTimeout(t);
    }
  }

