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

export async function renderPdfRemote(payload: RemotePdfRenderPayload): Promise<Buffer> {
    const controller = new AbortController();
    const t = setTimeout(
      () => controller.abort(),
      Number(process.env.PDF_RENDER_TIMEOUT_MS || 45000)
    );
  
    try {
      const t0 = Date.now()

      const url = `${process.env.PDF_RENDER_URL}/render`
      const baseHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.PDF_RENDER_TOKEN}`,
      }

      const body = JSON.stringify(payload)

      let res = await fetch(url, {
        method: "POST",
        headers: baseHeaders,
        body,
        signal: controller.signal,
      })
  
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`pdf_render_failed ${res.status} ${txt}`);
      }

      const buf = Buffer.from(await res.arrayBuffer())

      return buf
    } finally {
      clearTimeout(t);
    }
  }
  