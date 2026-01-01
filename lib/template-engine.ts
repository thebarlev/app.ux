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
  try {
    return Handlebars.compile(templateHtml)
  } catch (error) {
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
 */
export function compileAndRender(
  templateHtml: string,
  data: ReceiptTemplateData
): string {
  const compiled = compileTemplate(templateHtml)
  return renderTemplate(compiled, data)
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
  const { chromium } = await import("playwright")
  
  const {
    format = "A4",
    landscape = false,
    margin = { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    printBackground = true,
    scale = 1,
    outputPath,
  } = options

  let browser
  try {
    // Launch headless browser
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    // Build complete HTML document
    const fullHtml = `
      <!DOCTYPE html>
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
          ${css}
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `

    // Set page content
    await page.setContent(fullHtml, { waitUntil: "networkidle" })

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format,
      landscape,
      margin,
      printBackground,
      scale,
      path: outputPath, // If provided, saves to disk
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
