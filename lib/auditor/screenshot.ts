import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
import { AUDITOR_SCREENSHOTS_BUCKET } from "@/lib/storage/buckets"

export async function captureSiteScreenshot(params: {
  scanId: string
  url: string
  supabase: SupabaseClient
}): Promise<{ publicPath: string }> {
  const storagePath = `${params.scanId}.webp`

  // On Vercel: use @sparticuz/chromium (serverless-optimized). Chromium binary is ~280MB and
  // exceeds Vercel's 50MB function limit; @sparticuz/chromium provides a lightweight alternative.
  // Locally: use regular Playwright (postinstall installs Chromium).
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
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    })

    await page.goto(params.url, {
      waitUntil: "networkidle",
      timeout: 15_000,
    })

    const pngBuffer = await page.screenshot({
      fullPage: false,
      type: "png",
    })

    const webpBuffer = await sharp(pngBuffer)
      .webp({ quality: 50 })
      .toBuffer()

    const { data: uploadData, error } = await params.supabase.storage
      .from(AUDITOR_SCREENSHOTS_BUCKET)
      .upload(storagePath, webpBuffer, {
        contentType: "image/webp",
        upsert: true,
      })

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`)
    }

    const { data: publicUrlData } = params.supabase.storage
      .from(AUDITOR_SCREENSHOTS_BUCKET)
      .getPublicUrl(uploadData?.path || storagePath)

    return { publicPath: publicUrlData.publicUrl }
  } finally {
    await browser.close()
  }
}

