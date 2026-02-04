export async function renderPdfRemote(html: string): Promise<Buffer> {
    const controller = new AbortController();
    const t = setTimeout(
      () => controller.abort(),
      Number(process.env.PDF_RENDER_TIMEOUT_MS || 45000)
    );
  
    try {
      const t0 = Date.now()
      const res = await fetch(`${process.env.PDF_RENDER_URL}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PDF_RENDER_TOKEN}`,
        },
        body: JSON.stringify({ html }),
        signal: controller.signal,
      });
  
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`pdf_render_failed ${res.status} ${txt}`);
      }
  
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(t);
    }
  }
  