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
 * Priority: 1) Company's custom template, 2) Global default template, 3) Hardcoded fallback
 */
export async function getTemplateForDocument(
  companyId: string,
  documentType: "receipt" | "invoice" | "quote" | "delivery_note"
): Promise<{ html: string; css: string; templateId: string | null }> {
  const supabase = await createClient()

  // Try to get company-specific template first
  const { data: companyTemplate } = await supabase
    .from("templates")
    .select("id, html_template, css, is_active")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .order("is_default", { ascending: false }) // Prefer default template
    .limit(1)
    .maybeSingle()

  if (companyTemplate) {
    return {
      html: companyTemplate.html_template,
      css: companyTemplate.css || "",
      templateId: companyTemplate.id,
    }
  }

  // Fallback to global default template
  const { data: globalTemplate } = await supabase
    .from("templates")
    .select("id, html_template, css, is_active")
    .is("company_id", null) // Global templates have null company_id
    .eq("document_type", documentType)
    .eq("is_active", true)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle()

  if (globalTemplate) {
    return {
      html: globalTemplate.html_template,
      css: globalTemplate.css || "",
      templateId: globalTemplate.id,
    }
  }

  // Final fallback: Use hardcoded default template
  if (documentType === "receipt") {
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
        name,
        tax_id,
        address,
        phone,
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
        address
      )
    `)
    .eq("id", documentId)
    .single()

  if (docError || !doc) {
    throw new Error(`Document not found: ${documentId}`)
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

  // Build template data structure
  const templateData: ReceiptTemplateData = {
    company: {
      name: doc.company?.name || "",
      tax_id: doc.company?.tax_id || null,
      address: doc.company?.address || null,
      phone: doc.company?.phone || null,
      email: doc.company?.email || null,
      logo_url: doc.company?.logo_url || null,
      signature_url: doc.company?.signature_url || null,
    },
    customer: doc.customer ? {
      name: doc.customer.name || "",
      tax_id: doc.customer.tax_id || null,
      email: doc.customer.email || null,
      phone: doc.customer.phone || null,
      address: doc.customer.address || null,
    } : null,
    document: {
      type: doc.document_type,
      number: doc.document_number || "",
      issue_date: doc.issue_date,
      due_date: doc.due_date || null,
      valid_until: null, // For quotes
      reference_number: null,
      description: doc.description || null,
      currency: doc.currency,
      status: doc.document_status,
    },
    payments: payments.map((p: any) => ({
      payment_method: p.payment_method,
      amount: parseFloat(p.amount),
      reference_number: p.reference_number || null,
      notes: p.notes || null,
    })),
    items: (items || []).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_price),
      line_total: parseFloat(item.line_total),
      notes: item.notes || null,
    })),
    totals: {
      subtotal: doc.subtotal ? parseFloat(doc.subtotal) : null,
      vat_rate: doc.vat_rate ? parseFloat(doc.vat_rate) : null,
      vat_amount: doc.vat_amount ? parseFloat(doc.vat_amount) : null,
      discount_amount: doc.discount_amount ? parseFloat(doc.discount_amount) : null,
      total_amount: parseFloat(doc.total_amount),
    },
    notes: {
      internal_notes: doc.internal_notes || null,
      footer_text: null, // Can be set from company settings or template
    },
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
    // Prepare document data
    const templateData = await prepareDocumentData(documentId)

    // Get document type and company ID
    const supabase = await createClient()
    const { data: doc } = await supabase
      .from("documents")
      .select("document_type, company_id")
      .eq("id", documentId)
      .single()

    if (!doc) {
      return { success: false, error: "Document not found" }
    }

    // Get template
    const template = await getTemplateForDocument(
      doc.company_id,
      doc.document_type as any
    )

    // Render and generate PDF (no storage)
    const renderedHtml = compileAndRender(template.html, templateData)
    const pdfResult = await generatePDFFromHTML(renderedHtml, template.css, {
      format: "A4",
      printBackground: true,
    })

    return pdfResult
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
