"use server"

import { createClient } from "@/lib/supabase/server"
import { 
  compileAndRender, 
  generatePDFFromHTML, 
  validateTemplate 
} from "@/lib/template-engine"
import { getDefaultReceiptTemplate } from "@/lib/default-templates"
import type { 
  TemplateDefinition, 
  ReceiptTemplateData,
  PDFGenerationResult 
} from "@/lib/types/template"

// ==================== TEMPLATE FETCHING ====================

/**
 * Get template for document type (company-specific or global default)
 * Priority:
 * 1) Company's default template (is_default = TRUE for this company)
 * 2) Global default template (is_default = TRUE, company_id IS NULL)
 * 3) Any active company template for this document type
 * 4) Any active global template for this document type
 * 5) Hardcoded fallback
 */
export async function getTemplateForDocument(
  companyId: string,
  documentType: "receipt" | "invoice" | "quote" | "delivery_note"
): Promise<{ html: string; css: string; templateId: string | null }> {
  const supabase = await createClient()

  // PRIORITY 1: Company's default template
  const { data: companyDefault } = await supabase
    .from("templates")
    .select("id, html_template, css, is_active")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle()

  if (companyDefault) {
    console.log(`✅ Using company default template: ${companyDefault.id}`)
    return {
      html: companyDefault.html_template,
      css: companyDefault.css || "",
      templateId: companyDefault.id,
    }
  }

  // PRIORITY 2: Global default template
  const { data: globalDefault } = await supabase
    .from("templates")
    .select("id, html_template, css, is_active, name")
    .is("company_id", null)
    .eq("document_type", documentType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle()

  if (globalDefault) {
    console.log(`✅ Using global default template: ${globalDefault.name} (${globalDefault.id})`)
    return {
      html: globalDefault.html_template,
      css: globalDefault.css || "",
      templateId: globalDefault.id,
    }
  }

  // PRIORITY 3: Any active company template (fallback)
  const { data: anyCompanyTemplate } = await supabase
    .from("templates")
    .select("id, html_template, css, is_active")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (anyCompanyTemplate) {
    console.log(`⚠️ Using fallback company template: ${anyCompanyTemplate.id}`)
    return {
      html: anyCompanyTemplate.html_template,
      css: anyCompanyTemplate.css || "",
      templateId: anyCompanyTemplate.id,
    }
  }

  // PRIORITY 4: Any active global template (fallback)
  const { data: anyGlobalTemplate } = await supabase
    .from("templates")
    .select("id, html_template, css, is_active, name")
    .is("company_id", null)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (anyGlobalTemplate) {
    console.log(`⚠️ Using fallback global template: ${anyGlobalTemplate.name} (${anyGlobalTemplate.id})`)
    return {
      html: anyGlobalTemplate.html_template,
      css: anyGlobalTemplate.css || "",
      templateId: anyGlobalTemplate.id,
    }
  }

  // PRIORITY 5: Final fallback - Use hardcoded default template
  if (documentType === "receipt") {
    console.log(`⚠️ Using hardcoded fallback template for receipt`)
    const defaultTemplate = getDefaultReceiptTemplate()
    return {
      html: defaultTemplate.html,
      css: defaultTemplate.css,
      templateId: null,
    }
  }

  // If no template found and not a receipt, throw error
  throw new Error(`No template found for document type: ${documentType}`)
}

// ==================== DATA PREPARATION ====================

/**
 * Fetch document data and prepare it for template rendering
 */
export async function prepareDocumentData(
  documentId: string
): Promise<ReceiptTemplateData> {
  const supabase = await createClient()

  // Fetch document with all related data
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select(`
      *,
      company:companies(
        id,
        company_name,
        registration_number,
        company_number,
        address,
        street,
        city,
        postal_code,
        phone,
        mobile_phone,
        email,
        logo_url,
        signature_url
      ),
      customer:customers(
        id,
        name,
        tax_id,
        email,
        phone,
        mobile,
        address_street,
        address_city,
        address_zip
      )
    `)
    .eq("id", documentId)
    .single()

  if (docError || !doc) {
    console.warn(`[pdf-service] Document not found: ${documentId}`, docError)
    throw new Error(`DOCUMENT_NOT_FOUND:${documentId}`)
  }

  // Fetch line items
  const { data: items } = await supabase
    .from("document_line_items")
    .select("*")
    .eq("document_id", documentId)
    .order("line_number", { ascending: true })

  // Parse payment metadata
  const paymentMetadata = doc.payment_metadata as any
  const payments = paymentMetadata?.payments || []

  // ✅ helpers MUST be outside templateData object
  // Map currency symbol to currency code for Intl.NumberFormat
  const getCurrencyCode = (currencySymbol: string): string => {
    const currencyMap: Record<string, string> = {
      "₪": "ILS",
      "$": "USD",
      "€": "EUR",
      "£": "GBP",
    }
    return currencyMap[currencySymbol] || currencySymbol || "ILS"
  }

  const currencySymbol = doc.currency || "₪"
  const currencyCode = getCurrencyCode(currencySymbol)

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: currencyCode,
        currencyDisplay: "narrowSymbol",
      }).format(amount)
    } catch {
      return `${amount.toFixed(2)} ${currencySymbol}`
    }
  }

  const formatDate = (value: any) => {
    if (!value) return ""
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return ""
    return new Intl.DateTimeFormat("he-IL").format(d)
  }

  const buildPaymentDetails = (p: any) => {
    const parts: string[] = []
    if (p.reference_number) parts.push(p.reference_number)
    if (p.notes) parts.push(p.notes)
    return parts.join(" ").trim()
  }

  // Helper function to escape HTML and prevent XSS
  const escapeHtml = (text: string | null | undefined): string => {
    if (!text) return ""
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }


  const mappedPayments = payments.map((p: any) => {
    const amount = Number(p.amount ?? 0)
    const date = p.date || p.payment_date || doc.issue_date || ""

    return {
      method: p.payment_method || "",
      date: date,
      amount: amount,
      currency: currencyCode,
      reference: p.reference_number || null,
      description: p.notes || null,
      // Extended fields
      bank_name: p.bank_name || null,
      branch: p.branch || null,
      account_number: p.account_number || null,
      check_number: p.check_number || null,
      card_last4: p.card_last4 || null,
      transaction_id: p.transaction_id || null,
      // ✅ Display fields used by template
      details: buildPaymentDetails(p),
      display_date: formatDate(date),
      display_amount: formatCurrency(amount),
    } as any // Using 'as any' to allow extra display fields
  })

  // Build company address from separate fields if available, otherwise use address field
  let companyAddress = doc.company?.address || "";
  if (doc.company?.street || doc.company?.city) {
    const addressParts = [];
    if (doc.company.street) addressParts.push(doc.company.street);
    if (doc.company.city) addressParts.push(doc.company.city);
    if (doc.company.postal_code) addressParts.push(doc.company.postal_code);
    if (addressParts.length > 0) {
      companyAddress = addressParts.join(", ");
    }
  }
  
  // Use registration_number or company_number for tax ID
  const companyTaxId = doc.company?.registration_number || doc.company?.company_number || null;
  
  // Use mobile_phone or phone for company phone
  const companyPhone = doc.company?.mobile_phone || doc.company?.phone || null;
  
  // Build customer address from separate fields if available
  let customerAddress = null;
  if (doc.customer) {
    if (doc.customer.address_street || doc.customer.address_city) {
      const addressParts = [];
      if (doc.customer.address_street) addressParts.push(doc.customer.address_street);
      if (doc.customer.address_city) addressParts.push(doc.customer.address_city);
      if (doc.customer.address_zip) addressParts.push(doc.customer.address_zip);
      if (addressParts.length > 0) {
        customerAddress = addressParts.join(", ");
      }
    }
  }
  
  // Use mobile or phone for customer phone
  const customerPhone = doc.customer?.mobile || doc.customer?.phone || null;

  // Build template data structure
  const templateData: ReceiptTemplateData = {
    company: {
      company_name: doc.company?.company_name || "",
      company_tax_id: companyTaxId,
      company_address: companyAddress || null,
      company_phone: companyPhone,
      company_email: doc.company?.email || null,
      company_logo: doc.company?.logo_url || null,
    },
    customer: doc.customer ? {
      customer_name: doc.customer.name || "",
      customer_tax_id: doc.customer.tax_id || null,
      customer_email: doc.customer.email || null,
      customer_phone: customerPhone,
      customer_address: customerAddress,
    } : {
      customer_name: "",
    },
    document: {
      document_type: doc.document_type as any,
      document_number: doc.document_number || "",
      document_date: doc.issue_date || "",
      reference_number: null,
    },
    payments: mappedPayments,
    items: (items || []).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_price),
      amount: parseFloat(item.line_total),
      notes: item.notes || null,
    })),
    totals: {
      subtotal: doc.subtotal ? parseFloat(doc.subtotal) : 0,
      vat_rate: doc.vat_rate ? parseFloat(doc.vat_rate) : undefined,
      vat_amount: doc.vat_amount ? parseFloat(doc.vat_amount) : undefined,
      discount: doc.discount_amount ? parseFloat(doc.discount_amount) : undefined,
      total_amount: parseFloat(doc.total_amount || 0),
      currency: currencyCode,
    },
    notes_data: {
      notes: doc.internal_notes || null,
      footer_notes: null,
      signature: doc.company?.signature_url || null,
    },
    formatted_total: formatCurrency(parseFloat(doc.total_amount || 0)),
    formatted_date: formatDate(doc.issue_date),
    // Page numbers - default to 1 of 1, can be calculated dynamically if needed
    PAGE_NUMBER: "1",
    TOTAL_PAGES: "1",
    // Current date and time for footer
    CURRENT_DATE_TIME: new Date().toLocaleString("he-IL", { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit', 
      minute: '2-digit' 
    }),
  }

  // Generate HTML rows for payments table
  // This is used when template engine doesn't support {{#each}}
  if (mappedPayments.length > 0) {
    const paymentRows = mappedPayments.map((payment: any) => {
      // Get payment date (fallback to document date if missing)
      const paymentDate = payment.date || doc.issue_date || ""
      const formattedPaymentDate = formatDate(paymentDate)
      
      // Format amount with currency
      const formattedAmount = formatCurrency(payment.amount)
      
      // Build payment details (reference_number + notes)
      const paymentDetails = buildPaymentDetails({
        reference_number: payment.reference,
        notes: payment.description,
      })
      
      // Escape HTML to prevent XSS
      const escapedMethod = escapeHtml(payment.method)
      const escapedDetails = escapeHtml(paymentDetails)
      const escapedDate = escapeHtml(formattedPaymentDate)
      const escapedAmount = escapeHtml(formattedAmount)
      
      // Generate table row HTML
      return `<tr>
  <td>${escapedMethod}</td>
  <td>${escapedDetails}</td>
  <td>${escapedDate}</td>
  <td>${escapedAmount}</td>
</tr>`
    })
    
    templateData.PAYMENTS_ROWS_HTML = paymentRows.join("\n")
  } else {
    // Empty string if no payments (not null)
    templateData.PAYMENTS_ROWS_HTML = ""
  }

  return templateData
}

// ==================== PDF GENERATION ====================

/**
 * Generate PDF for a finalized document
 * This is called once when document status changes to "final"
 * 
 * @param documentId - ID of the document to generate PDF for
 * @returns PDFGenerationResult with success status and file path/buffer
 */
export async function generateDocumentPDF(
  documentId: string
): Promise<PDFGenerationResult> {
  const supabase = await createClient()

  try {
    // 1. Fetch document and verify it's finalized
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, document_type, document_status, company_id, document_number")
      .eq("id", documentId)
      .single()

    if (docError || !doc) {
      return {
        success: false,
        error: "Document not found",
      }
    }

    if (doc.document_status !== "final") {
      return {
        success: false,
        error: "Document must be finalized before generating PDF",
      }
    }

    // 2. Prepare document data for template
    const templateData = await prepareDocumentData(documentId)

    // 3. Get appropriate template
    const template = await getTemplateForDocument(
      doc.company_id,
      doc.document_type as any
    )

    // 4. Validate template (optional - log warnings)
    const validation = validateTemplate(template.html, doc.document_type as any)
    if (!validation.valid) {
      console.warn(`Template missing required placeholders:`, validation.missing)
    }

    // 5. Render HTML from template
    const renderedHtml = compileAndRender(template.html, templateData)

    // 6. Generate PDF using Playwright
    const pdfResult = await generatePDFFromHTML(renderedHtml, template.css, {
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    })

    if (!pdfResult.success || !pdfResult.buffer) {
      return {
        success: false,
        error: pdfResult.error || "PDF generation failed",
      }
    }

    // 7. Upload PDF to Supabase Storage
    const fileName = `${doc.document_type}_${doc.document_number}_${Date.now()}.pdf`
    const storagePath = `documents/${doc.company_id}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(storagePath, pdfResult.buffer, {
        contentType: "application/pdf",
        upsert: false,
      })

    if (uploadError) {
      return {
        success: false,
        error: `Failed to upload PDF: ${uploadError.message}`,
      }
    }

    // 8. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("business-assets")
      .getPublicUrl(storagePath)

    const pdfUrl = publicUrlData.publicUrl

    // 9. Update document with PDF path
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        pdf_path: pdfUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)

    if (updateError) {
      console.error("Failed to update document with PDF path:", updateError)
    }

    return {
      success: true,
      path: pdfUrl,
      buffer: pdfResult.buffer,
    }
  } catch (error) {
    console.error("PDF generation error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ==================== PREVIEW GENERATION (No Storage) ====================

/**
 * Generate PDF preview for a draft document (doesn't save to storage)
 * Used for live preview in the UI
 */
export async function generatePreviewPDF(
  documentId: string
): Promise<PDFGenerationResult> {
  try {
    console.log(`[generatePreviewPDF] Starting for document: ${documentId}`)
    
    // Prepare document data
    const templateData = await prepareDocumentData(documentId)

    // Get document type and company ID
    const supabase = await createClient()
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("document_type, company_id")
      .eq("id", documentId)
      .single()

    if (docError || !doc) {
      console.warn(`[generatePreviewPDF] Document not found: ${documentId}`, docError)
      return { success: false, error: `DOCUMENT_NOT_FOUND:${documentId}` }
    }

    // Get template
    const template = await getTemplateForDocument(
      doc.company_id,
      doc.document_type as any
    )

    // Render and generate PDF (no storage)
    console.log(`[generatePreviewPDF] Rendering template for document: ${documentId}`)
    const renderedHtml = compileAndRender(template.html, templateData)
    
    console.log(`[generatePreviewPDF] Generating PDF from HTML`)
    const pdfResult = await generatePDFFromHTML(renderedHtml, template.css, {
      format: "A4",
      printBackground: true,
    })

    console.log(`[generatePreviewPDF] PDF generated successfully`)
    return pdfResult
  } catch (error) {
    console.error(`[generatePreviewPDF] Error:`, error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: errorMessage,
    }
  }
}
