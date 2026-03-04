import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
import { AUDITOR_SCREENSHOTS_BUCKET } from "@/lib/storage/buckets"

export async function captureSiteScreenshot(params: {
  scanId: string
  url: string
  supabase: SupabaseClient
}): Promise<{ publicPath: string }> {
  // Ensure we use deploy-packaged browsers (node_modules) instead of per-user cache.
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = "0"

  // Import after env is set so Playwright resolves browsers path correctly.
  const { chromium } = await import("playwright")

  const storagePath = `${params.scanId}.webp`

  const browser = await chromium.launch({ headless: true })

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

