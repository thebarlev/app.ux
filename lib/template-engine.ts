import Handlebars from "handlebars"
import type { 
  TemplateDefinition, 
  ReceiptTemplateData,
  PDFGenerationOptions,
  PDFGenerationResult 
} from "@/lib/types/template"
import { writeFile } from "node:fs/promises"
import { renderPdfRemote } from "@/lib/pdf/remote-render"

// ==================== HANDLEBARS HELPERS ====================

/**
 * Register custom Handlebars helpers for template rendering
 */
function registerHelpers() {
  // Format currency (e.g., 1234.56 → "1,234.56 ₪")
  Handlebars.registerHelper("formatCurrency", function (amount: number, currency: string) {
    const formatted = new Intl.NumberFormat("he-IL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
    const symbol = currency === "ILS" ? "₪" : currency
    return `${formatted} ${symbol}`
  })

  // Format date (e.g., "2025-12-27" → "27/12/2025")
  Handlebars.registerHelper("formatDate", function (dateString: string) {
    if (!dateString) return ""
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("he-IL").format(date)
  })

  // Format percentage (e.g., 0.17 → "17%")
  Handlebars.registerHelper("formatPercent", function (value: number) {
    return `${(value * 100).toFixed(0)}%`
  })

  // Conditional check for payment method
  Handlebars.registerHelper("isPaymentMethod", function (method: string, targetMethod: string) {
    return method === targetMethod
  })

  // Safe HTML output (for pre-sanitized content)
  Handlebars.registerHelper("raw", function (content: string) {
    return new Handlebars.SafeString(content)
  })

  // Math operations
  Handlebars.registerHelper("add", function (a: number, b: number) {
    return a + b
  })

  Handlebars.registerHelper("multiply", function (a: number, b: number) {
    return a * b
  })

  // Conditional helpers
  Handlebars.registerHelper("eq", function (a: any, b: any) {
    return a === b
  })

  Handlebars.registerHelper("gt", function (a: number, b: number) {
    return a > b
  })

  Handlebars.registerHelper("gte", function (a: number, b: number) {
    return a >= b
  })
}

// Initialize helpers on module load
registerHelpers()

// ==================== DEBUG/ANALYSIS HELPERS ====================

export type HandlebarsBlockCounters = {
  openIf: number
  closeIf: number
  openEach: number
  closeEach: number
}

export function countHandlebarsBlocks(src: string): HandlebarsBlockCounters {
  const s = String(src || "")
  return {
    openIf: (s.match(/\{\{#if\b/g) || []).length,
    closeIf: (s.match(/\{\{\/if\}\}/g) || []).length,
    openEach: (s.match(/\{\{#each\b/g) || []).length,
    closeEach: (s.match(/\{\{\/each\}\}/g) || []).length,
  }
}

export function stripHtmlToText(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function redactDigits(text: string): string {
  return String(text || "").replace(/\d/g, "")
}

export function safeExcerptNoDigits(text: string, maxChars: number): string {
  const noDigits = redactDigits(text)
  return noDigits.slice(0, Math.max(0, maxChars))
}

// ==================== TEMPLATE COMPILATION ====================

/**
 * Compile a template string into a reusable function
 * @param templateHtml - Raw HTML template with Handlebars placeholders
 * @returns Compiled template function
 */
export function compileTemplate(templateHtml: string): HandlebarsTemplateDelegate {  
  try {
    return Handlebars.compile(templateHtml)
  } catch (error) {    throw new Error(`Template compilation failed: ${error}`)
  }
}

/**
 * Render a template with provided data
 * @param template - Compiled Handlebars template
 * @param data - Data to inject into template
 * @returns Rendered HTML string
 */
export function renderTemplate(
  template: HandlebarsTemplateDelegate,
  data: ReceiptTemplateData
): string {
  try {
    return template(data)
  } catch (error) {
    throw new Error(`Template rendering failed: ${error}`)
  }
}

/**
 * One-step compilation and rendering
 * @param templateHtml - Raw HTML template
 * @param data - Data to inject
 * @returns Rendered HTML
 * @throws Error with clear message if template compilation or rendering fails
 */
export function compileAndRender(
  templateHtml: string,
  data: ReceiptTemplateData
): string {  
  try {
    // #region agent log
    const hasLegacyIf = typeof templateHtml === "string" && /\{\{\s*if\s+[^}]+\}\}/i.test(templateHtml)
    const hasHashSuffix = typeof templateHtml === "string" && /\{\{\{?[\w.]+\#\}?\}\}/.test(templateHtml)
    const hasLegacyHtmlVars =
      typeof templateHtml === "string" &&
      (templateHtml.includes("TI_ROWS_HTML#") || templateHtml.includes("PAYMENTS_ROWS_HTML#") || templateHtml.includes("SKU_ROWS_HTML#"))
    const hasQuadBraces = typeof templateHtml === "string" && templateHtml.includes("{{{{")
    const hasEmptyIf = typeof templateHtml === "string" && /\{\{\s*if\s*\}\}/i.test(templateHtml)
    const hasEndIf = typeof templateHtml === "string" && /\{\{\s*(endif|\/if)\s*\}\}/i.test(templateHtml)
    const hasLegacyIfCloseToken = typeof templateHtml === "string" && /\{\{\s*if\s*\/\s*#?\s*\}\}/i.test(templateHtml)
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'template-engine.ts:compileAndRender:pre',message:'Template preflight',data:{hasLegacyIf,hasHashSuffix,hasLegacyHtmlVars,hasQuadBraces,hasEmptyIf,hasEndIf,hasLegacyIfCloseToken,htmlLength:typeof templateHtml==="string"?templateHtml.length:0},timestamp:Date.now(),hypothesisId:'H_TEMPLATE_SYNTAX'})}).catch(()=>{});
    // #endregion

    // Normalize legacy template syntax seen in older DB templates:
    // - {{if VAR#}}  -> {{#if VAR}}
    // - {{VAR#}}     -> {{VAR}}
    // - {{TI_ROWS_HTML#}} -> {{{TI_ROWS_HTML}}} (raw HTML injection for rows)
    const normalized = (() => {
      let s = String(templateHtml || "")

      const countBlocks = (src: string) => {
        const openIf = (src.match(/\{\{#if\b/g) || []).length
        const closeIf = (src.match(/\{\{\/if\}\}/g) || []).length
        const openEach = (src.match(/\{\{#each\b/g) || []).length
        const closeEach = (src.match(/\{\{\/each\}\}/g) || []).length
        return { openIf, closeIf, openEach, closeEach }
      }

      const before = countBlocks(s)

      // if blocks
      s = s.replace(/\{\{\s*if\s+([^}]+?)\s*\}\}/gi, (_m, expr) => {
        const cleaned = String(expr).trim().replace(/\#\s*$/, "")
        return `{{#if ${cleaned}}}`
      })
      s = s.replace(/\{\{\s*endif\s*\}\}/gi, "{{/if}}")
      // Legacy close token variants used in some templates:
      // - {{if/}} or {{if/#}}  -> {{/if}}
      s = s.replace(/\{\{\s*if\s*\/\s*#?\s*\}\}/gi, "{{/if}}")
      // Some templates contain stray {{if}} / {{/if}} without an expression.
      // These are invalid in Handlebars and must never render as text.
      s = s.replace(/\{\{\s*if\s*\}\}/gi, "")
      // NOTE: Do NOT remove "{{/if}}" generally; that deletes valid closing blocks.
      // hash suffix vars
      s = s.replace(/\{\{\{\s*([\w.]+)\#\s*\}\}\}/g, (_m, k) => `{{{${k}}}}`)
      s = s.replace(/\{\{\s*([\w.]+)\#\s*\}\}/g, (_m, k) => `{{${k}}}`)
      // known HTML row vars should be raw
      s = s.replace(/\{\{\s*(TI_ROWS_HTML|PAYMENTS_ROWS_HTML|SKU_ROWS_HTML)\s*\}\}/g, (_m, k) => `{{{${k}}}}`)

      // Handle a common broken pattern in some templates:
      // - "{{{{PAYMENTS_ROWS_HTML}}" or "{{{{PAYMENTS_ROWS_HTML}}}}" (quad braces) which Handlebars treats as a raw block opener.
      // For our variables, this is always a mistake; normalize to triple-stash variable output.
      s = s.replace(/\{\{\{\{\s*([A-Z0-9_]+)\s*\}\}\}\}/g, (_m, k) => `{{{${k}}}}`)
      s = s.replace(/\{\{\{\{\s*([A-Z0-9_]+)\s*\}\}\s*/g, (_m, k) => `{{{${k}}}}`)

      // Ensure the HTML row vars are triple-stash even if they were wrapped strangely.
      s = s.replace(/\{\{\{?\s*(TI_ROWS_HTML|PAYMENTS_ROWS_HTML|SKU_ROWS_HTML)\s*\}?\}\}/g, (_m, k) => `{{{${k}}}}`)

      const after = countBlocks(s)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'template-engine.ts:compileAndRender:counters',message:'Handlebars block counters (pre/post normalization)',data:{before,after},timestamp:Date.now(),hypothesisId:'H_TEMPLATE_COUNTERS'})}).catch(()=>{});
      // #endregion
      return s
    })()

    const compiled = compileTemplate(normalized)
    const rendered = renderTemplate(compiled, data)

    // #region agent log
    const renderedHasMustache = typeof rendered === "string" && rendered.includes("{{")
    const renderedTextLen =
      typeof rendered === "string"
        ? rendered
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim().length
        : 0
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'template-engine.ts:compileAndRender:post',message:'Template rendered',data:{renderedHasMustache,renderedLength:typeof rendered==="string"?rendered.length:0,renderedTextLen},timestamp:Date.now(),hypothesisId:'H_TEMPLATE_SYNTAX'})}).catch(()=>{});
    // #endregion

    return rendered
  } catch (error: any) {    
    // Re-throw with clear message for template errors
    const errorMessage = error?.message || String(error)
    if (errorMessage.includes("Parse error") || errorMessage.includes("template")) {
      throw new Error(`Template rendering failed: ${errorMessage}. Please check the template in admin panel for syntax errors (unclosed {{#if}} blocks, missing placeholders, etc.)`)
    }
    throw new Error(`Template rendering failed: ${errorMessage}`)
  }
}

// ==================== PDF GENERATION (Remote Renderer) ====================

/**
 * Generate PDF from HTML using Playwright's headless Chromium
 * @param html - Full HTML document (including <html>, <head>, <body>)
 * @param css - Optional CSS to inject into document
 * @param options - PDF generation options
 * @returns PDF generation result with file path or buffer
 */
export async function generatePDFFromHTML(
  html: string,
  css: string = "",
  options: PDFGenerationOptions = {}
): Promise<PDFGenerationResult> {  
  const outputPath = (options as any).outputPath

  const shouldUseRemoteRenderer =
    typeof process.env.PDF_RENDER_URL === "string" &&
    process.env.PDF_RENDER_URL.length > 0 &&
    typeof process.env.PDF_RENDER_TOKEN === "string" &&
    process.env.PDF_RENDER_TOKEN.length > 0

  if (shouldUseRemoteRenderer) {
    try {
      const footer_html = String((options as any)?.footerTemplate || "")
      const footer_css = ""
      // Source of truth: CSS must originate from DB only.
      // Transport packaging: embed the SAME css verbatim in <head> to protect against renderers
      // that ignore a separate "css" field. This does not add/merge any external CSS.
      function packageHtmlWithCss(innerHtml: string, innerCss: string) {
        const styleTag = `<style>${innerCss || ""}</style>`
        if (typeof innerHtml === "string" && innerHtml.includes("</head>")) {
          return innerHtml.replace("</head>", `${styleTag}</head>`)
        }
        return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
${styleTag}
</head>
<body>
${innerHtml}
</body>
</html>`
      }
      const packagedHtml = packageHtmlWithCss(html, css)
      const remoteOptions = {
        format: (options as any)?.format,
        // Always enable background printing for PDF (required for CSS backgrounds/colors).
        printBackground: typeof (options as any)?.printBackground === "boolean" ? (options as any)?.printBackground : true,
        margin: (options as any)?.margin,
        landscape: (options as any)?.landscape,
        scale: (options as any)?.scale,
      }

      const pdfBytes = await renderPdfRemote({
        html: packagedHtml,
        css,
        footer_html,
        footer_css,
        options: remoteOptions,
      })

      if (outputPath) {
        await writeFile(outputPath, new Uint8Array(pdfBytes))
      }

      return { success: true, buffer: pdfBytes, path: outputPath }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const { chromium } = await import("playwright-core")

  // Preflight: fail fast with an actionable message if Playwright browsers aren't installed.
  // This is NOT business logic; it prevents opaque runtime failures in finalize/sign flow.
  try {
    const { existsSync } = require("node:fs") as typeof import("node:fs")
    const executablePath = chromium.executablePath()
    if (!executablePath || !existsSync(executablePath)) {
      throw new Error(
        `Playwright Chromium executable is missing at: ${executablePath || "(empty path)"}.\n` +
          `Run: npm exec playwright install chromium\n` +
          `In CI/Vercel ensure browsers are installed during build (recommended env: PLAYWRIGHT_BROWSERS_PATH=0).`
      )
    }
  } catch (e) {
    // If preflight itself fails (shouldn't), continue to original launch and let Playwright throw.
  }
  
  const {
    format = "A4",
    margin = { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
  } = options
  // Always print CSS backgrounds/colors in PDFs.
  const printBackground = true
  
  const landscape = (options as any).landscape || false
  const scale = (options as any).scale || 1
  // const outputPath = (options as any).outputPath
  const blockNetwork = options.blockNetwork === true

  let browser
  try {
    // Launch headless browser
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    if (blockNetwork) {
      // Determinism requirement: no outbound network. Allow only data: and about:.
      await page.route("**/*", async (route) => {
        const url = route.request().url()
        if (url.startsWith("data:") || url.startsWith("about:")) {
          return route.continue()
        }
        return route.abort()
      })
    }

    // Check if HTML already includes DOCTYPE or html tag (full document)
    const isFullDocument = html.trim().startsWith('<!DOCTYPE') || html.trim().startsWith('<html')    
    let fullHtml: string
    
    if (isFullDocument) {
      // HTML is already a complete document - inject CSS into existing <head>
      // Replace any external CSS links with inline styles
      let processedHtml = html
      
      // Remove external CSS links (they won't work in Playwright)
      processedHtml = processedHtml.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
      
      // Inject CSS into <head>
      if (processedHtml.includes('</head>')) {
        // Inject CSS before closing </head>
        const imageHidingCss = `
    /* Hide broken images and images with empty/null src */
    img[src=""],
    img:not([src]),
    img[src="null"],
    img[src="undefined"],
    img[src*="undefined"],
    img[src*="null"] {
      display: none !important;
    }
    /* Prevent image loading errors from showing broken icon */
    img {
      object-fit: contain;
    }
    /* Reduce vertical spacing between signature and footer to prevent 2nd page */
    .stamp,
    .signature-section,
    section.stamp {
      margin-bottom: 60px !important;
    }
    .footer {
      margin-top: 0 !important;
      padding-top: 10px !important;
    }
    /* If signature section exists, reduce its bottom margin */
    .stamp + .footer,
    .signature-section + .footer,
    section.stamp + footer {
      margin-top: -20px !important;
    }
    /* Prevent empty second page - remove min-height that forces 2nd page */
    .page,
    .receipt-document,
    main.page {
      min-height: auto !important;
      max-height: 1123px !important; /* A4 height in pixels at 96 DPI */
      height: auto !important;
    }
    /* Prevent page breaks that create empty pages */
    body,
    html {
      height: auto !important;
      min-height: auto !important;
      max-height: 1123px !important;
    }
    /* Ensure document number is visible - make sure it's displayed */
    .doc-number,
    .doc-title-block .doc-number,
    .doc-title-block .doc-number *,
    h1 .doc-number,
    [class*="receipt-number"],
    [class*="document-number"],
    .header-card h1,
    .doc-title,
    h1 {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: inherit !important;
      font-size: inherit !important;
    }
    /* Force content inside doc-number to be visible */
    .doc-number:empty::after {
      content: attr(data-number) !important;
    }
    /* Ensure text content is not hidden */
    .doc-number,
    .doc-title-block .doc-number {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }`
        fullHtml = processedHtml.replace('</head>', `<style>${imageHidingCss}${css}</style></head>`)
      } else if (processedHtml.includes('<head>')) {
        // Add CSS after <head>
        const imageHidingCss = `
    /* Hide broken images and images with empty/null src */
    img[src=""],
    img:not([src]),
    img[src="null"],
    img[src="undefined"],
    img[src*="undefined"],
    img[src*="null"] {
      display: none !important;
    }
    /* Prevent image loading errors from showing broken icon */
    img {
      object-fit: contain;
    }
    /* Reduce vertical spacing between signature and footer to prevent 2nd page */
    .stamp,
    .signature-section,
    section.stamp {
      margin-bottom: 60px !important;
    }
    .footer {
      margin-top: 0 !important;
      padding-top: 10px !important;
    }
    /* If signature section exists, reduce its bottom margin */
    .stamp + .footer,
    .signature-section + .footer,
    section.stamp + footer {
      margin-top: -20px !important;
    }
    /* Prevent empty second page - remove min-height that forces 2nd page */
    .page,
    .receipt-document,
    main.page {
      min-height: auto !important;
      max-height: 1123px !important; /* A4 height in pixels at 96 DPI */
      height: auto !important;
    }
    /* Prevent page breaks that create empty pages */
    body,
    html {
      height: auto !important;
      min-height: auto !important;
      max-height: 1123px !important;
    }
    /* Ensure document number is visible - make sure it's displayed */
    .doc-number,
    .doc-title-block .doc-number,
    .doc-title-block .doc-number *,
    h1 .doc-number,
    [class*="receipt-number"],
    [class*="document-number"],
    .header-card h1,
    .doc-title,
    h1 {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: inherit !important;
      font-size: inherit !important;
    }
    /* Force content inside doc-number to be visible */
    .doc-number:empty::after {
      content: attr(data-number) !important;
    }
    /* Ensure text content is not hidden */
    .doc-number,
    .doc-title-block .doc-number {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }`
        fullHtml = processedHtml.replace('<head>', `<head><style>${imageHidingCss}${css}</style>`)
      } else if (processedHtml.includes('<body>')) {
        // No head tag, add one before <body>
        const imageHidingCss = `
    /* Hide broken images and images with empty/null src */
    img[src=""],
    img:not([src]),
    img[src="null"],
    img[src="undefined"],
    img[src*="undefined"],
    img[src*="null"] {
      display: none !important;
    }
    /* Prevent image loading errors from showing broken icon */
    img {
      object-fit: contain;
    }
    /* Reduce vertical spacing between signature and footer to prevent 2nd page */
    .stamp,
    .signature-section,
    section.stamp {
      margin-bottom: 60px !important;
    }
    .footer {
      margin-top: 0 !important;
      padding-top: 10px !important;
    }
    /* If signature section exists, reduce its bottom margin */
    .stamp + .footer,
    .signature-section + .footer,
    section.stamp + footer {
      margin-top: -20px !important;
    }
    /* Prevent empty second page - remove min-height that forces 2nd page */
    .page,
    .receipt-document,
    main.page {
      min-height: auto !important;
      max-height: 1123px !important; /* A4 height in pixels at 96 DPI */
      height: auto !important;
    }
    /* Prevent page breaks that create empty pages */
    body,
    html {
      height: auto !important;
      min-height: auto !important;
      max-height: 1123px !important;
    }
    /* Ensure document number is visible - make sure it's displayed */
    .doc-number,
    .doc-title-block .doc-number,
    .doc-title-block .doc-number *,
    h1 .doc-number,
    [class*="receipt-number"],
    [class*="document-number"],
    .header-card h1,
    .doc-title,
    h1 {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: inherit !important;
      font-size: inherit !important;
    }
    /* Force content inside doc-number to be visible */
    .doc-number:empty::after {
      content: attr(data-number) !important;
    }
    /* Ensure text content is not hidden */
    .doc-number,
    .doc-title-block .doc-number {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }`
        fullHtml = processedHtml.replace('<body>', `<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${imageHidingCss}${css}</style></head><body>`)
      } else {
        // Fallback: wrap in full document
        const imageHidingCss = `
    /* Hide broken images and images with empty/null src */
    img[src=""],
    img:not([src]),
    img[src="null"],
    img[src="undefined"],
    img[src*="undefined"],
    img[src*="null"] {
      display: none !important;
    }
    /* Prevent image loading errors from showing broken icon */
    img {
      object-fit: contain;
    }
    /* Reduce vertical spacing between signature and footer to prevent 2nd page */
    .stamp,
    .signature-section,
    section.stamp {
      margin-bottom: 60px !important;
    }
    .footer {
      margin-top: 0 !important;
      padding-top: 10px !important;
    }
    /* If signature section exists, reduce its bottom margin */
    .stamp + .footer,
    .signature-section + .footer,
    section.stamp + footer {
      margin-top: -20px !important;
    }
    /* Prevent empty second page - remove min-height that forces 2nd page */
    .page,
    .receipt-document,
    main.page {
      min-height: auto !important;
      max-height: 1123px !important; /* A4 height in pixels at 96 DPI */
      height: auto !important;
    }
    /* Prevent page breaks that create empty pages */
    body,
    html {
      height: auto !important;
      min-height: auto !important;
      max-height: 1123px !important;
    }
    /* Ensure document number is visible - make sure it's displayed */
    .doc-number,
    .doc-title-block .doc-number,
    .doc-title-block .doc-number *,
    h1 .doc-number,
    [class*="receipt-number"],
    [class*="document-number"],
    .header-card h1,
    .doc-title,
    h1 {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: inherit !important;
      font-size: inherit !important;
    }
    /* Force content inside doc-number to be visible */
    .doc-number:empty::after {
      content: attr(data-number) !important;
    }
    /* Ensure text content is not hidden */
    .doc-number,
    .doc-title-block .doc-number {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }`
        fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Heebo', 'Arial', sans-serif;
      direction: rtl;
      text-align: right;
    }
    ${imageHidingCss}
    ${css}
  </style>
</head>
<body>
  ${processedHtml}
</body>
</html>`
      }
    } else {
      // HTML is just content - wrap it in full document
      const imageHidingCss = `
    /* Hide broken images and images with empty/null src */
    img[src=""],
    img:not([src]),
    img[src="null"],
    img[src="undefined"],
    img[src*="undefined"],
    img[src*="null"] {
      display: none !important;
    }
    /* Prevent image loading errors from showing broken icon */
    img {
      object-fit: contain;
    }
    /* Reduce vertical spacing between signature and footer to prevent 2nd page */
    .stamp,
    .signature-section,
    section.stamp {
      margin-bottom: 60px !important;
    }
    .footer {
      margin-top: 0 !important;
      padding-top: 10px !important;
    }
    /* If signature section exists, reduce its bottom margin */
    .stamp + .footer,
    .signature-section + .footer,
    section.stamp + footer {
      margin-top: -20px !important;
    }
    /* Prevent empty second page - remove min-height that forces 2nd page */
    .page,
    .receipt-document,
    main.page {
      min-height: auto !important;
      max-height: 1123px !important; /* A4 height in pixels at 96 DPI */
      height: auto !important;
    }
    /* Prevent page breaks that create empty pages */
    body,
    html {
      height: auto !important;
      min-height: auto !important;
      max-height: 1123px !important;
    }
    /* Ensure document number is visible - make sure it's displayed */
    .doc-number,
    .doc-title-block .doc-number,
    .doc-title-block .doc-number *,
    h1 .doc-number,
    [class*="receipt-number"],
    [class*="document-number"],
    .header-card h1,
    .doc-title,
    h1 {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: inherit !important;
      font-size: inherit !important;
    }
    /* Force content inside doc-number to be visible */
    .doc-number:empty::after {
      content: attr(data-number) !important;
    }
    /* Ensure text content is not hidden */
    .doc-number,
    .doc-title-block .doc-number {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }`
      fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Heebo', 'Arial', sans-serif;
      direction: rtl;
      text-align: right;
    }
    ${imageHidingCss}
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`
    }    
    // Set page content with longer timeout for images/fonts to load
    await page.setContent(fullHtml, { 
      waitUntil: "networkidle",
      timeout: 30000 
    })    
    // Hide broken images and images with empty/null src before waiting
    await page.evaluate(() => {
      // Hide images with empty/null/undefined src
      Array.from(document.images).forEach(img => {
        const src = img.src || img.getAttribute('src') || ''
        if (!src || src === 'null' || src === 'undefined' || src.includes('undefined') || src.includes('null')) {
          img.style.display = 'none'
        }
        // Also hide on error
        img.onerror = () => {
          img.style.display = 'none'
        }
      })
    })
    
    // Wait for fonts and images to load
    await page.evaluate(() => {
      return Promise.all([
        document.fonts.ready,
        ...Array.from(document.images).map(img => {
          if (img.complete) return Promise.resolve()
          return new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = () => {
              img.style.display = 'none' // Hide broken images
              resolve // Continue even if image fails
            }
            setTimeout(resolve, 5000) // Timeout after 5s
          })
        })
      ])
    })
    // Force single page by removing min-height constraints and preventing page breaks
    await page.evaluate(() => {
      // Remove min-height that forces 2nd page
      const style = document.createElement('style');
      style.textContent = `
        .page, .receipt-document, main.page {
          min-height: auto !important;
          max-height: 1123px !important;
          height: auto !important;
        }
        body, html {
          height: auto !important;
          min-height: auto !important;
          max-height: 1123px !important;
        }
        * {
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
      `;
      document.head.appendChild(style);
    });
    
    // Measure page height before generating PDF to check if it fits on one page
    const pageMetrics = await page.evaluate(() => {
      const body = document.body;
      const main = (document.querySelector('main.page') ||
        document.querySelector('.page') ||
        document.querySelector('.receipt-document')) as HTMLElement | null
      const mainRect = main?.getBoundingClientRect()
      const bodyRect = body?.getBoundingClientRect()
      const mainStyles = main ? window.getComputedStyle(main) : null
      return {
        bodyHeight: body?.scrollHeight || 0,
        bodyClientHeight: body?.clientHeight || 0,
        bodyOffsetHeight: body?.offsetHeight || 0,
        windowInnerHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        a4HeightPx: 1123, // A4 height in pixels at 96 DPI (297mm)
        wouldFitOnOnePage: (body?.scrollHeight || 0) < 1123,
        dir: document?.documentElement?.getAttribute('dir') || (document as any).dir || null,
        mainExists: !!main,
        mainRect: mainRect
          ? { left: Math.round(mainRect.left), right: Math.round(mainRect.right), top: Math.round(mainRect.top), width: Math.round(mainRect.width) }
          : null,
        bodyRect: bodyRect
          ? { left: Math.round(bodyRect.left), right: Math.round(bodyRect.right), top: Math.round(bodyRect.top), width: Math.round(bodyRect.width) }
          : null,
        mainPaddingLeft: mainStyles ? mainStyles.paddingLeft : null,
        mainPaddingRight: mainStyles ? mainStyles.paddingRight : null,
        mainMarginLeft: mainStyles ? mainStyles.marginLeft : null,
        mainMarginRight: mainStyles ? mainStyles.marginRight : null,
      };
    });
    // Generate PDF (optional header/footer if provided in options)
    const pdfBuffer = await page.pdf({
      format,
      landscape,
      margin: {
        top: margin?.top || "3mm",     // Minimal top margin to start content higher
        right: margin?.right || "3mm",   // Minimal side margins
        bottom: margin?.bottom || "3mm", // Minimal bottom margin to prevent footer from causing 2nd page
        left: margin?.left || "3mm",    // Minimal side margins
      },
      printBackground: true, // Required: ensure CSS backgrounds render
      scale,
      path: outputPath, // If provided, saves to disk
      preferCSSPageSize: false, // Use PDF format size, not CSS @page size
      displayHeaderFooter: options.displayHeaderFooter || false,
      headerTemplate: options.headerTemplate,
      footerTemplate: options.footerTemplate,
    })
    await browser.close()

    return {
      success: true,
      buffer: pdfBuffer,
      path: outputPath,
    }
  } catch (error) {
    if (browser) await browser.close()
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ==================== TEMPLATE VALIDATION ====================

/**
 * Validate that template contains required placeholders
 * @param templateHtml - Template HTML to validate
 * @param documentType - Type of document (receipt, invoice, etc.)
 * @returns Validation result with missing placeholders
 */
export function validateTemplate(
  templateHtml: string,
  documentType: "receipt" | "tax_invoice" | "invoice" | "quote" | "delivery_note"
): { valid: boolean; missing: string[]; recommended: string[] } {
  const VALIDATION_RULES = {
    receipt: {
      required: [
        "{{company.name}}",
        "{{document.number}}",
        "{{document.issue_date}}",
        "{{totals.total_amount}}",
      ],
      recommended: [
        "{{company.logo_url}}",
        "{{customer.name}}",
        "{{#each items}}",
        "{{#each payments}}",
      ],
    },
    tax_invoice: {
      required: [
        "{{company.name}}",
        "{{document.number}}",
        "{{document.issue_date}}",
        "{{totals.total_amount}}",
      ],
      recommended: [
        "{{company.logo_url}}",
        "{{customer.name}}",
        "{{#each items}}",
        "{{#each payments}}",
      ],
    },
    invoice: {
      required: [
        "{{company.name}}",
        "{{company.tax_id}}",
        "{{customer.name}}",
        "{{document.number}}",
        "{{document.issue_date}}",
        "{{totals.subtotal}}",
        "{{totals.vat_amount}}",
        "{{totals.total_amount}}",
      ],
      recommended: [
        "{{company.logo_url}}",
        "{{customer.email}}",
        "{{#each items}}",
      ],
    },
    quote: {
      required: [
        "{{company.name}}",
        "{{customer.name}}",
        "{{document.number}}",
        "{{document.issue_date}}",
        "{{totals.total_amount}}",
      ],
      recommended: [
        "{{company.logo_url}}",
        "{{document.valid_until}}",
        "{{#each items}}",
      ],
    },
    delivery_note: {
      required: [
        "{{company.name}}",
        "{{customer.name}}",
        "{{document.number}}",
        "{{document.issue_date}}",
        "{{#each items}}",
      ],
      recommended: [
        "{{company.address}}",
        "{{customer.address}}",
        "{{document.reference_number}}",
      ],
    },
  }

  const rules = VALIDATION_RULES[documentType]
  const missing: string[] = []
  const missingRecommended: string[] = []

  // Check required placeholders
  rules.required.forEach((placeholder) => {
    if (!templateHtml.includes(placeholder)) {
      missing.push(placeholder)
    }
  })

  // Check recommended placeholders
  rules.recommended.forEach((placeholder) => {
    if (!templateHtml.includes(placeholder)) {
      missingRecommended.push(placeholder)
    }
  })

  return {
    valid: missing.length === 0,
    missing,
    recommended: missingRecommended,
  }
}

// Note: getDefaultReceiptTemplate moved to lib/default-templates.ts
// to avoid importing Playwright in Client Components
