import Handlebars from "handlebars"
import type { 
  TemplateDefinition, 
  ReceiptTemplateData,
  PDFGenerationOptions,
  PDFGenerationResult 
} from "@/lib/types/template"

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

// ==================== TEMPLATE COMPILATION ====================

/**
 * Compile a template string into a reusable function
 * @param templateHtml - Raw HTML template with Handlebars placeholders
 * @returns Compiled template function
 */
export function compileTemplate(templateHtml: string): HandlebarsTemplateDelegate {
  // #region agent log
  // Check for unclosed Handlebars blocks
  const ifBlocks = (templateHtml.match(/\{\{#if/g) || []).length;
  const ifEndBlocks = (templateHtml.match(/\{\{\/if\}\}/g) || []).length;
  const eachBlocks = (templateHtml.match(/\{\{#each/g) || []).length;
  const eachEndBlocks = (templateHtml.match(/\{\{\/each\}\}/g) || []).length;
  const last200Chars = templateHtml.substring(Math.max(0, templateHtml.length - 200));
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:75',message:'compileTemplate - checking blocks',data:{ifBlocks,ifEndBlocks,eachBlocks,eachEndBlocks,unclosedIf:ifBlocks-ifEndBlocks,unclosedEach:eachBlocks-eachEndBlocks,last200Chars},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  
  try {
    return Handlebars.compile(templateHtml)
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:82',message:'compileTemplate - compilation error',data:{error:error instanceof Error?error.message:String(error),templateLength:templateHtml.length,last500Chars:templateHtml.substring(Math.max(0,templateHtml.length-500))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    throw new Error(`Template compilation failed: ${error}`)
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:111',message:'compileAndRender - entry',data:{templateHtmlLength:templateHtml?.length||0,hasData:!!data,dataKeys:data?Object.keys(data).slice(0,10):[],companyName:data?.company?.company_name||'N/A',documentNumber:data?.document?.document_number||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  try {
    const compiled = compileTemplate(templateHtml)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:115',message:'compileAndRender - after compile',data:{compiledType:typeof compiled},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const rendered = renderTemplate(compiled, data)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:117',message:'compileAndRender - after render',data:{renderedLength:rendered?.length||0,renderedPreview:rendered?.substring(0,200)||'EMPTY',hasContent:rendered?.includes('<body')||rendered?.includes('<main')||false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    return rendered
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:145',message:'compileAndRender - error',data:{errorMessage:error?.message||'N/A',errorName:error?.name||'N/A',isParseError:error?.message?.includes('Parse error')||false,isTemplateError:error?.message?.includes('Template')||false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'N'})}).catch(()=>{});
    // #endregion
    
    // Re-throw with clear message for template errors
    const errorMessage = error?.message || String(error)
    if (errorMessage.includes("Parse error") || errorMessage.includes("template")) {
      throw new Error(`Template rendering failed: ${errorMessage}. Please check the template in admin panel for syntax errors (unclosed {{#if}} blocks, missing placeholders, etc.)`)
    }
    throw new Error(`Template rendering failed: ${errorMessage}`)
  }
}

// ==================== PDF GENERATION (Playwright) ====================

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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:128',message:'generatePDFFromHTML - entry',data:{htmlLength:html?.length||0,htmlPreview:html?.substring(0,300)||'EMPTY',cssLength:css?.length||0,cssPreview:css?.substring(0,200)||'EMPTY',hasHexColors:css?.match(/#[0-9a-fA-F]{6}/g)?.length||0,printBackground:options.printBackground},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const { chromium } = await import("playwright")
  
  const {
    format = "A4",
    margin = { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    printBackground = true,
  } = options
  
  const landscape = (options as any).landscape || false
  const scale = (options as any).scale || 1
  const outputPath = (options as any).outputPath

  let browser
  try {
    // Launch headless browser
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    // Check if HTML already includes DOCTYPE or html tag (full document)
    const isFullDocument = html.trim().startsWith('<!DOCTYPE') || html.trim().startsWith('<html')
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:152',message:'generatePDFFromHTML - before processing',data:{isFullDocument,hasHead:html.includes('<head'),hasBody:html.includes('<body'),hasStyle:html.includes('<style')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:227',message:'generatePDFFromHTML - before setContent',data:{fullHtmlLength:fullHtml?.length||0,fullHtmlPreview:fullHtml?.substring(0,500)||'EMPTY',hasStyleTag:fullHtml.includes('<style'),cssInHtml:fullHtml.includes(css?.substring(0,50)||'')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Set page content with longer timeout for images/fonts to load
    await page.setContent(fullHtml, { 
      waitUntil: "networkidle",
      timeout: 30000 
    })
    
    // #region agent log
    const pageContent = await page.evaluate(() => ({
      bodyText: document.body?.innerText?.substring(0,200)||'EMPTY',
      bodyHTML: document.body?.innerHTML?.substring(0,300)||'EMPTY',
      hasImages: document.images.length,
      imageSrcs: Array.from(document.images).slice(0,3).map(img=>img.src||'NO_SRC'),
      computedStyles: window.getComputedStyle(document.body)?.backgroundColor||'N/A',
      hasContent: document.body?.textContent?.trim().length>0||false
    }));
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:232',message:'generatePDFFromHTML - after setContent',data:pageContent,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
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
    
    // #region agent log
    const afterWait = await page.evaluate(() => ({
      imagesLoaded: Array.from(document.images).filter(img=>img.complete).length,
      totalImages: document.images.length,
      fontsReady: document.fonts.status
    }));
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:246',message:'generatePDFFromHTML - after wait',data:afterWait,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

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
      return {
        bodyHeight: body?.scrollHeight || 0,
        bodyClientHeight: body?.clientHeight || 0,
        bodyOffsetHeight: body?.offsetHeight || 0,
        windowInnerHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        a4HeightPx: 1123, // A4 height in pixels at 96 DPI (297mm)
        wouldFitOnOnePage: (body?.scrollHeight || 0) < 1123,
      };
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:324',message:'generatePDFFromHTML - page metrics before PDF',data:pageMetrics,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Generate PDF with minimal margins to prevent 2-page output
    // Use displayHeaderFooter: false to prevent empty second page
    const pdfBuffer = await page.pdf({
      format,
      landscape,
      margin: {
        top: margin?.top || "3mm",     // Minimal top margin to start content higher
        right: margin?.right || "8mm",   // Minimal side margins
        bottom: margin?.bottom || "3mm", // Minimal bottom margin to prevent footer from causing 2nd page
        left: margin?.left || "8mm",    // Minimal side margins
      },
      printBackground,
      scale,
      path: outputPath, // If provided, saves to disk
      preferCSSPageSize: false, // Use PDF format size, not CSS @page size
      displayHeaderFooter: false, // Prevent Playwright from adding header/footer that might cause empty page
    })
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/template-engine.ts:256',message:'generatePDFFromHTML - after pdf generation',data:{pdfBufferLength:pdfBuffer?.length||0,printBackground,pageMetrics},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

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
  documentType: "receipt" | "invoice" | "quote" | "delivery_note"
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
