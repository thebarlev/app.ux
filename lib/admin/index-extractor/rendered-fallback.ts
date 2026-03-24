export async function getRenderedHtml(params: { url: string; timeoutMs?: number }): Promise<string> {
  const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 12_000
  const isVercel = !!process.env.VERCEL

  const browser = isVercel
    ? await (async () => {
        const chromiumPkg = (await import("@sparticuz/chromium")).default
        const { chromium } = await import("playwright-core")
        return chromium.launch({
          args: chromiumPkg.args,
          executablePath: await chromiumPkg.executablePath(),
          headless: true,
        })
      })()
    : await (async () => {
        if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = "0"
        const { chromium } = await import("playwright")
        return chromium.launch({ headless: true })
      })()

  try {
    const page = await browser.newPage()
    await page.goto(params.url, { waitUntil: "domcontentloaded", timeout: timeoutMs })
    await page
      .waitForSelector("main, article, section, body", { timeout: Math.min(4_000, timeoutMs) })
      .catch(() => null)
    await page.waitForLoadState("networkidle", { timeout: Math.min(4_000, timeoutMs) }).catch(() => null)
    return await page.content()
  } finally {
    await browser.close()
  }
}
