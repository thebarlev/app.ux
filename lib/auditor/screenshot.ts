import { mkdir } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

export async function captureSiteScreenshot(params: {
  scanId: string
  url: string
}): Promise<{ publicPath: string }> {
  // Ensure we use deploy-packaged browsers (node_modules) instead of per-user cache.
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = "0"

  // Import after env is set so Playwright resolves browsers path correctly.
  const { chromium } = await import("playwright")

  const relPublicPath = `/auditor-screenshots/${params.scanId}.webp`
  const absDir = path.join(process.cwd(), "public", "auditor-screenshots")
  const absPath = path.join(process.cwd(), "public", "auditor-screenshots", `${params.scanId}.webp`)

  await mkdir(absDir, { recursive: true })

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
  
    await sharp(pngBuffer)
      .webp({ quality: 50 })
      .toFile(absPath)
  
    return { publicPath: relPublicPath }
  } finally {
    await browser.close()
  }
}

