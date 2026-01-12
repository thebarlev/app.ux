"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { 
  compileAndRender, 
  generatePDFFromHTML, 
  validateTemplate 
} from "@/lib/template-engine"
import { getDefaultReceiptTemplate } from "@/lib/default-templates"
import { getPageTexts } from "@/lib/system-texts"
import { signPdfWithEnvP12 } from "@/lib/documents/signing/p12-signer"
import { isDigitalSignaturesEnabled } from "@/lib/documents/signing/feature-flags"
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
  documentType: "receipt" | "invoice" | "quote" | "delivery_note",
  options?: {
    language?: "he" | "en";
    /**
     * Preview-only behavior: allow falling back to Hebrew if EN variant is missing.
     * IMPORTANT: For issuance (final/copy) this must be false.
     */
    allowFallbackToHe?: boolean;
  }
): Promise<{
  html: string;
  css: string;
  templateId: string | null;
  resolvedLanguage: "he" | "en";
  didFallbackToHe: boolean;
}> {
  const supabase = await createClient()
  const language: "he" | "en" = options?.language || "he"
  const allowFallbackToHe = options?.allowFallbackToHe === true

  const pickVariant = (row: any) => {
    const heHtml = row?.html_he ?? null
    const heCss = row?.css_he ?? null
    const enHtml = row?.html_en ?? null
    const enCss = row?.css_en ?? null

    if (language === "en") {
      if (typeof enHtml === "string" && enHtml.trim().length > 0) {
        return { html: enHtml, css: enCss || "", resolvedLanguage: "en" as const, didFallbackToHe: false }
      }
      if (allowFallbackToHe && typeof heHtml === "string" && heHtml.trim().length > 0) {
        return { html: heHtml, css: heCss || "", resolvedLanguage: "he" as const, didFallbackToHe: true }
      }
      throw new Error("TEMPLATE_MISSING_LANGUAGE:en")
    }

    if (typeof heHtml === "string" && heHtml.trim().length > 0) {
      return { html: heHtml, css: heCss || "", resolvedLanguage: "he" as const, didFallbackToHe: false }
    }
    throw new Error("TEMPLATE_MISSING_LANGUAGE:he")
  }

  // PRIORITY 1: Company's default template
  const { data: companyDefault } = await supabase
    .from("templates")
    .select("id, html_he, css_he, html_en, css_en, is_active")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle()

  if (companyDefault) {
    console.log(`✅ Using company default template: ${companyDefault.id}`)
    const picked = pickVariant(companyDefault)
    return {
      ...picked,
      templateId: companyDefault.id,
    }
  }

  // PRIORITY 2: Global default template
  const { data: globalDefault } = await supabase
    .from("templates")
    .select("id, html_he, css_he, html_en, css_en, is_active, name")
    .is("company_id", null)
    .eq("document_type", documentType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle()

  if (globalDefault) {
    console.log(`✅ Using global default template: ${globalDefault.name} (${globalDefault.id})`)
    const picked = pickVariant(globalDefault)
    return {
      ...picked,
      templateId: globalDefault.id,
    }
  }

  // PRIORITY 3: Any active company template (fallback)
  const { data: anyCompanyTemplate } = await supabase
    .from("templates")
    .select("id, html_he, css_he, html_en, css_en, is_active")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (anyCompanyTemplate) {
    console.log(`⚠️ Using fallback company template: ${anyCompanyTemplate.id}`)
    const picked = pickVariant(anyCompanyTemplate)
    return {
      ...picked,
      templateId: anyCompanyTemplate.id,
    }
  }

  // PRIORITY 4: Any active global template (fallback)
  const { data: anyGlobalTemplate } = await supabase
    .from("templates")
    .select("id, html_he, css_he, html_en, css_en, is_active, name")
    .is("company_id", null)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (anyGlobalTemplate) {
    console.log(`⚠️ Using fallback global template: ${anyGlobalTemplate.name} (${anyGlobalTemplate.id})`)
    const picked = pickVariant(anyGlobalTemplate)
    return {
      ...picked,
      templateId: anyGlobalTemplate.id,
    }
  }

  // PRIORITY 5: Final fallback - Use hardcoded default template
  if (documentType === "receipt") {
    console.log(`⚠️ Using hardcoded fallback template for receipt`)
    const defaultTemplate = getDefaultReceiptTemplate()
    if (language === "en" && !allowFallbackToHe) {
      throw new Error("TEMPLATE_MISSING_LANGUAGE:en")
    }
    return {
      html: defaultTemplate.html,
      css: defaultTemplate.css,
      templateId: null,
      resolvedLanguage: "he",
      didFallbackToHe: language === "en",
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
  documentId: string,
  languageOverride?: "he" | "en",
  options?: {
    documentCopyLabel?: string;
  }
): Promise<ReceiptTemplateData> {
  const supabase = await createClient()
  const adminClient = createAdminClient() // For signed URLs if needed

  const selectWithEnglishCompanyFields = `
      *,
      language,
      company:companies(
        id,
        company_name,
        company_name_en,
        registration_number,
        company_number,
        contact_first_name,
        contact_first_name_en,
        address,
        street,
        city,
        postal_code,
        phone,
        mobile_phone,
        email,
        website,
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
    `

  const selectWithoutEnglishCompanyFields = `
      *,
      language,
      company:companies(
        id,
        company_name,
        registration_number,
        company_number,
        contact_first_name,
        address,
        street,
        city,
        postal_code,
        phone,
        mobile_phone,
        email,
        website,
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
    `

  // Fetch document with all related data.
  // IMPORTANT: Some environments may not yet have the optional EN company columns.
  // We retry without those columns if Postgres reports "column does not exist" (42703).
  let { data: doc, error: docError } = await supabase
    .from("documents")
    .select(selectWithEnglishCompanyFields)
    .eq("id", documentId)
    .single()

  if (docError?.code === "42703") {
    const msg = String((docError as any)?.message || "")
    const missingEnglishCols =
      msg.includes("company_name_en") || msg.includes("contact_first_name_en")
    if (missingEnglishCols) {
      ;({ data: doc, error: docError } = await supabase
        .from("documents")
        .select(selectWithoutEnglishCompanyFields)
        .eq("id", documentId)
        .single())
    }
  }
  if (docError || !doc) {
    console.warn(`[pdf-service] Document not found: ${documentId}`, docError)
    throw new Error(`DOCUMENT_NOT_FOUND:${documentId}`)
  }

  // Fetch line items (these contain the payments)
  const { data: items, error: itemsError } = await supabase
    .from("document_line_items")
    .select("*")
    .eq("document_id", documentId)
    .order("line_number", { ascending: true })
  // CRITICAL FIX: Payments are stored in document_line_items, not in doc.payment_metadata
  // Map line items to payments array
  const payments = (items || []).map((item: any) => {
    const metadata = item.payment_metadata || {}
    return {
      payment_method: item.description || "", // Payment method name
      date: item.item_date || doc.issue_date || "",
      amount: parseFloat(item.line_total || item.unit_price || 0),
      currency: item.currency || doc.currency || "₪",
      reference_number: metadata.transactionReference || metadata.checkNumber || null,
      notes: metadata.description || null,
      // Extended fields from metadata
      bank_name: item.bank_name || metadata.checkBank || null,
      branch: item.branch || metadata.checkBranch || metadata.bankBranch || null,
      account_number: item.account_number || metadata.checkAccount || metadata.bankAccount || null,
      check_number: metadata.checkNumber || null,
      card_last4: metadata.cardLastDigits || null,
      transaction_id: metadata.transactionReference || null,
      // Additional payment fields from user input
      payerAccount: metadata.payerAccount || null,
      cardInstallments: metadata.cardInstallments || null,
      cardDealType: metadata.cardDealType || null,
      cardType: metadata.cardType || null,
    }
  })
  // ✅ helpers MUST be outside templateData object
  const documentLanguage: "he" | "en" = languageOverride || ((doc as any)?.language === "en" ? "en" : "he")

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
      return new Intl.NumberFormat(documentLanguage === "en" ? "en-US" : "he-IL", {
        style: "currency",
        currency: currencyCode,
        currencyDisplay: documentLanguage === "en" ? "code" : "narrowSymbol",
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

  // Enhanced payment details builder - includes all relevant fields from user input
  const buildPaymentDetails = (p: any) => {
    const parts: string[] = []
    
    // Reference number / Transaction ID
    if (p.reference_number) parts.push(p.reference_number)
    if (p.transaction_id && p.transaction_id !== p.reference_number) parts.push(`עסקה: ${p.transaction_id}`)
    
    // Bank transfer details
    if (p.bank_name) parts.push(p.bank_name)
    if (p.branch) parts.push(`סניף: ${p.branch}`)
    if (p.account_number) parts.push(`חשבון: ${p.account_number}`)
    
    // Digital wallet / Payer account
    if (p.payerAccount) parts.push(`חשבון משלם: ${p.payerAccount}`)
    
    // Check details
    if (p.check_number) parts.push(`צ׳ק מס׳ ${p.check_number}`)
    
    // Credit card details - all fields from user input
    if (p.card_last4) {
      const cardParts: string[] = [`כרטיס: *${p.card_last4}`]
      if (p.cardType) cardParts.push(p.cardType)
      if (p.cardDealType) {
        const dealTypeMap: Record<string, string> = {
          "regular": "רגיל",
          "payments": "תשלומים",
          "credit": "אשראי",
          "deferred": "דחוי"
        }
        cardParts.push(dealTypeMap[p.cardDealType] || p.cardDealType)
      }
      if (p.cardInstallments) cardParts.push(`${p.cardInstallments} תשלומים`)
      parts.push(cardParts.join(" - "))
    }
    
    // Notes / Description
    if (p.notes) parts.push(p.notes)
    
    return parts.join(" | ").trim()
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
      // Additional payment fields from user input
      payerAccount: p.payerAccount || null,
      cardInstallments: p.cardInstallments || null,
      cardDealType: p.cardDealType || null,
      cardType: p.cardType || null,
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

  // Company name + issuer first name (localized)
  const companyNameHe = doc.company?.company_name || ""
  const companyNameEn = (doc.company as any)?.company_name_en || ""
  const issuerFirstNameHe = (doc.company as any)?.contact_first_name || ""
  const issuerFirstNameEn = (doc.company as any)?.contact_first_name_en || ""
  const companyNameLocalized = documentLanguage === "en" ? (companyNameEn || companyNameHe) : companyNameHe
  const issuerFirstNameLocalized = documentLanguage === "en" ? (issuerFirstNameEn || issuerFirstNameHe) : issuerFirstNameHe

  // System texts for document/PDF rendering
  const t = await getPageTexts("receipt", documentLanguage)
  
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

  // ============================================
  // CREATE SIGNED URLs FOR LOGO AND SIGNATURE (if bucket is private)
  // ============================================
  let logoUrl: string | null = null
  let signatureUrl: string | null = null
  
  // Helper to extract storage path from URL or use direct path
  const getStoragePathFromUrl = (url: string | null | undefined): string | null => {
    if (!url) return null
    // If URL contains storage path, extract it
    // Example: https://xxx.supabase.co/storage/v1/object/public/business-assets/business-logos/xxx/logo.png
    // Or: business-logos/xxx/logo.png
    const storageMatch = url.match(/business-(logos|signatures)\/[^/]+\/[^/]+/)
    if (storageMatch) {
      return storageMatch[0]
    }
    // If it's already a storage path (relative)
    if (url.startsWith('business-logos/') || url.startsWith('business-signatures/')) {
      return url
    }
    // If it's a full URL, try to extract path after /business-assets/
    const assetsMatch = url.match(/business-assets\/(.+)$/)
    if (assetsMatch) {
      return assetsMatch[1]
    }
    return null
  }

  // Process logo URL
  if (doc.company?.logo_url) {
    const storagePath = getStoragePathFromUrl(doc.company.logo_url)
    if (storagePath) {
      // Try to create signed URL (works for private buckets)
      try {
        const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
          .from("business-assets")
          .createSignedUrl(storagePath, 3600) // 1 hour expiry
        
        if (!signedUrlError && signedUrlData?.signedUrl) {
          logoUrl = signedUrlData.signedUrl
          console.log(`[prepareDocumentData] Created signed URL for logo: ${storagePath}`)
        } else {
          // If signed URL fails, try public URL (bucket might be public)
          const { data: publicUrlData } = adminClient.storage
            .from("business-assets")
            .getPublicUrl(storagePath)
          logoUrl = publicUrlData.publicUrl || doc.company.logo_url
          console.log(`[prepareDocumentData] Using public URL for logo: ${publicUrlData.publicUrl || doc.company.logo_url}`)
        }
      } catch (error) {
        // Fallback to original URL
        logoUrl = doc.company.logo_url
        console.warn(`[prepareDocumentData] Failed to create signed URL for logo, using original:`, error)
      }
    } else {
      // If we can't extract storage path, use original URL (might be external URL)
      logoUrl = doc.company.logo_url
    }
  }

  // Process signature URL
  if (doc.company?.signature_url) {
    const storagePath = getStoragePathFromUrl(doc.company.signature_url)
    if (storagePath) {
      // Try to create signed URL (works for private buckets)
      try {
        const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
          .from("business-assets")
          .createSignedUrl(storagePath, 3600) // 1 hour expiry
        
        if (!signedUrlError && signedUrlData?.signedUrl) {
          signatureUrl = signedUrlData.signedUrl
          console.log(`[prepareDocumentData] Created signed URL for signature: ${storagePath}`)
        } else {
          // If signed URL fails, try public URL (bucket might be public)
          const { data: publicUrlData } = adminClient.storage
            .from("business-assets")
            .getPublicUrl(storagePath)
          signatureUrl = publicUrlData.publicUrl || doc.company.signature_url
          console.log(`[prepareDocumentData] Using public URL for signature: ${publicUrlData.publicUrl || doc.company.signature_url}`)
        }
      } catch (error) {
        // Fallback to original URL
        signatureUrl = doc.company.signature_url
        console.warn(`[prepareDocumentData] Failed to create signed URL for signature, using original:`, error)
      }
    } else {
      // If we can't extract storage path, use original URL (might be external URL)
      signatureUrl = doc.company.signature_url
    }
  }

  // Build template data structure  
  const templateData: ReceiptTemplateData & Record<string, any> = {
    t,
    DOCUMENT_COPY_LABEL: options?.documentCopyLabel ?? "",
    company: {
      company_name: companyNameLocalized,
      company_name_he: companyNameHe,
      company_name_en: companyNameEn,
      contact_first_name: issuerFirstNameLocalized,
      contact_first_name_he: issuerFirstNameHe,
      contact_first_name_en: issuerFirstNameEn,
      company_tax_id: companyTaxId,
      company_address: companyAddress || null,
      company_phone: companyPhone,
      company_email: doc.company?.email || null,
      company_logo: logoUrl || null, // Use signed URL if available, null if no logo
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
      language: documentLanguage,
      direction: documentLanguage === "en" ? "ltr" : "rtl",
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
      signature: signatureUrl || null, // Use signed URL if available, null if no signature
    },
    formatted_total: formatCurrency(parseFloat(doc.total_amount || 0)),
    formatted_date: formatDate(doc.issue_date),
    // Page numbers - default to 1 of 1, can be calculated dynamically if needed
    PAGE_NUMBER: "1",
    TOTAL_PAGES: "1",
    // Current date and time for footer
    CURRENT_DATE_TIME: new Date().toLocaleString(documentLanguage === "en" ? "en-US" : "he-IL", { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit', 
      minute: '2-digit' 
    }),
    
    // ============================================
    // LEGACY PLACEHOLDERS (for backward compatibility with old templates)
    // ============================================
    // Company legacy placeholders
    USERCOMPANYNAME: companyNameLocalized,
    USERID: companyTaxId || "",
    USERADDRESS: companyAddress || "",
    PHONE: companyPhone || "",
    EMAIL: doc.company?.email || "",
    DOMAIN: doc.company?.website || "",
    LOGO_URL: logoUrl || null, // Use signed URL if available, null if no logo (template can use {{#if}})
    SIGNATURE_URL: signatureUrl || null, // Use signed URL if available, null if no signature (template can use {{#if}})
    
    // Customer legacy placeholders
    CLIENTNAME: doc.customer?.name || "",
    BUSINESSID: doc.customer?.tax_id || "",
    CLIENTPHONE: customerPhone || "",
    CLIENTADDRESS: customerAddress || "",
    
    // Document legacy placeholders
    RECEIPTNUMBER: doc.document_number || "",
    RECEIPTNNUMBER: doc.document_number || "", // Typo variant
    Datecreation: formatDate(doc.issue_date),
    DATE: formatDate(doc.issue_date),
    TIME: new Date().toLocaleTimeString(documentLanguage === "en" ? "en-US" : "he-IL", { hour: '2-digit', minute: '2-digit' }),
    DESCRIPTION: doc.document_description || "",
    AMOUNT: formatCurrency(parseFloat(doc.total_amount || 0)),
    TOTAL: formatCurrency(parseFloat(doc.total_amount || 0)),
    TOTAL_AMOUNT: formatCurrency(parseFloat(doc.total_amount || 0)),
    NOTES: doc.internal_notes || "",
    
    // Additional flat placeholders for templates that use dot notation
    company_name: companyNameLocalized,
    company_tax_id: companyTaxId || "",
    company_address: companyAddress || "",
    company_phone: companyPhone || "",
    company_email: doc.company?.email || "",
    company_logo: logoUrl || null, // Use signed URL if available, null if no logo
    customer_name: doc.customer?.name || "",
    customer_tax_id: doc.customer?.tax_id || "",
    customer_phone: customerPhone || "",
    customer_address: customerAddress || "",
    document_number: doc.document_number || "",
    document_date: formatDate(doc.issue_date),
    document_language: documentLanguage,
    total_amount: formatCurrency(parseFloat(doc.total_amount || 0)),
    description: doc.document_description || "",
    notes: doc.internal_notes || "",
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
      
      // Build payment details (includes all relevant fields from user input)
      const paymentDetails = buildPaymentDetails({
        reference_number: payment.reference,
        transaction_id: payment.transaction_id,
        bank_name: payment.bank_name,
        branch: payment.branch,
        account_number: payment.account_number,
        check_number: payment.check_number,
        card_last4: payment.card_last4,
        payerAccount: payment.payerAccount,
        cardInstallments: payment.cardInstallments,
        cardDealType: payment.cardDealType,
        cardType: payment.cardType,
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
  documentId: string,
  options?: { language?: "he" | "en"; mode?: "preview" | "final" | "recovery" | "copy" }
): Promise<PDFGenerationResult> {
  console.log(`[generateDocumentPDF] Starting PDF generation for document: ${documentId}`)
  
  // Use admin client for ALL operations (ONE SOURCE OF TRUTH - server-side only)
  let adminClient: ReturnType<typeof createAdminClient>
  try {
    adminClient = createAdminClient()
  } catch (adminError: any) {
    console.error(`[generateDocumentPDF] Failed to create admin client:`, adminError.message)
    return {
      success: false,
      error: `Failed to initialize admin client: ${adminError.message}`,
    }
  }
  try {
    // 1. Fetch document and verify it's finalized (using admin client - bypasses RLS)
    const { data: doc, error: docError } = await adminClient
      .from("documents")
      .select("id, document_type, document_status, company_id, document_number, pdf_storage_key, language")
      .eq("id", documentId)
      .single()
    
    // Log document_number for debugging
    console.log(`[generateDocumentPDF] Document number from DB:`, {
      documentId,
      document_number: doc?.document_number || 'NULL',
      document_number_type: typeof doc?.document_number,
      document_number_length: doc?.document_number?.length || 0,
    })
    if (docError || !doc) {      return {
        success: false,
        error: "Document not found",
      }
    }
    // CRITICAL: Allow PDF generation for 'draft' documents (called from finalizeDocument BEFORE finalization)
    // Also allow for 'final' and 'pdf_ready' documents (idempotent fallback in API route)
    // This ensures PDF can be generated and uploaded BEFORE document becomes immutable
    if (doc.document_status !== "final" && doc.document_status !== "pdf_ready" && doc.document_status !== "draft") {      return {
        success: false,
        error: `Document status '${doc.document_status}' is not valid for PDF generation. Document must be 'draft', 'final', or 'pdf_ready'.`,
      }
    }

    const docLanguage: "he" | "en" = ((doc as any)?.language as any) || "he"
    const targetLanguage: "he" | "en" = options?.language || docLanguage
    const pdfMode = options?.mode || "preview"

    // Regulatory: originals are Hebrew-only.
    if ((pdfMode === "final" || pdfMode === "recovery") && targetLanguage !== "he") {
      return {
        success: false,
        error: "ORIGINAL_MUST_BE_HE: מסמך מקור חייב להיות בעברית לפי הוראות ניהול ספרים",
      }
    }

    const documentCopyLabel =
      pdfMode === "copy"
        ? (targetLanguage === "en" ? "Certified Copy" : "העתק נאמן למקור")
        : (pdfMode === "final" || pdfMode === "recovery")
          ? "מקור"
          : ""

    // Regulatory check: If PDF already exists, return it (immutable) - only for base language.
    // IMPORTANT: for `mode=copy` we must NOT reuse the stored original; copies are generated on-the-fly.
    if (pdfMode !== "copy" && !options?.language && doc.pdf_storage_key) {
      // Use admin client to verify file exists (bypasses RLS)
      const { data: fileData } = await adminClient.storage
        .from("business-assets")
        .list(`documents/${documentId}`, {
          limit: 1,
          search: "source.pdf"
        })

      if (fileData && fileData.length > 0) {
        console.log(`[generateDocumentPDF] PDF already exists for document ${documentId}, returning existing`)
        return {
          success: true,
          path: doc.pdf_storage_key, // Return storage key (bucket is private)
          storageKey: doc.pdf_storage_key, // Explicit storageKey field
          buffer: undefined,
        }
      }
    }

    // 2. Prepare document data for template
    const templateData = await prepareDocumentData(documentId, targetLanguage, {
      documentCopyLabel,
    })

    // 3. Get appropriate template
    const template = await getTemplateForDocument(doc.company_id, doc.document_type as any, {
      language: targetLanguage,
      // IMPORTANT: For issuance (copy/final/recovery), do NOT fallback across languages.
      allowFallbackToHe: pdfMode === "preview",
    })

    // 4. Validate template (optional - log warnings)
    const validation = validateTemplate(template.html, doc.document_type as any)
    if (!validation.valid) {
      console.warn(`Template missing required placeholders:`, validation.missing)
    }

    // 5. Render HTML from template    
    const renderedHtml = compileAndRender(template.html, templateData)

    const markLanguage: "he" | "en" = (templateData as any)?.document?.language || targetLanguage
    // Mandatory mark: "מסמך ממוחשב" / "Computerized document"
    const computerizedMark =
      (templateData as any)?.t?.document_computerized_mark ||
      (markLanguage === "en" ? "Computerized document" : "מסמך ממוחשב")

    const markHtml = `
<div class="computerized-doc-mark" dir="${templateData.document?.direction || (markLanguage === "en" ? "ltr" : "rtl")}">
  ${String(computerizedMark)}
</div>`.trim()

    const markCss = `
.computerized-doc-mark {
  position: fixed;
  bottom: 8mm;
  ${markLanguage === "en" ? "left: 8mm;" : "right: 8mm;"}
  font-size: 12px;
  font-family: 'Heebo', 'Arial', sans-serif;
  color: #111827;
  opacity: 0.9;
  z-index: 9999;
}`.trim()

    const injectMark = (html: string) => {
      if (!html) return html
      if (html.includes("computerized-doc-mark")) return html
      if (html.includes("</body>")) return html.replace("</body>", `${markHtml}</body>`)
      if (html.includes("</html>")) return html.replace("</html>", `${markHtml}</html>`)
      return `${html}\n${markHtml}`
    }

    const renderedHtmlWithMark = injectMark(renderedHtml)
    const cssWithMark = `${template.css || ""}\n${markCss}`
    // 6. Generate PDF using Playwright with minimal margins to prevent 2-page output
    console.log(`[generateDocumentPDF] Generating PDF buffer from HTML for document: ${documentId}`)
    const pdfResult = await generatePDFFromHTML(renderedHtmlWithMark, cssWithMark, {
      format: "A4",
      printBackground: true,
      margin: {
        top: "3mm",     // Minimal top margin to start content higher
        right: "8mm",   // Minimal side margins
        bottom: "3mm",  // Minimal bottom margin to prevent footer from causing 2nd page
        left: "8mm",    // Minimal side margins
      },
    })
    if (!pdfResult.success || !pdfResult.buffer) {
      const errorMsg = pdfResult.error || "PDF generation failed"
      console.error(`[generateDocumentPDF] PDF buffer generation failed for document ${documentId}:`, errorMsg)
      return {
        success: false,
        error: errorMsg,
      }
    }

    let finalPdfBuffer = Buffer.from(pdfResult.buffer as any)

    const signingMode = pdfMode
    const shouldSignPdf =
      isDigitalSignaturesEnabled() && (signingMode === "final" || signingMode === "recovery")
    const signingInfo = shouldSignPdf
      ? signPdfWithEnvP12(finalPdfBuffer)
      : null

    if (signingInfo) {
      finalPdfBuffer = signingInfo.signedPdf
    }

    console.log(
      `[generateDocumentPDF] PDF buffer created successfully for document ${documentId}, size: ${finalPdfBuffer.length} bytes`
    )

    // Copy mode: return buffer only (do NOT upload or persist).
    if (pdfMode === "copy") {
      return {
        success: true,
        buffer: finalPdfBuffer,
      }
    }

    // 7. Check if PDF already exists (immutable - never regenerate)
    const storageKey =
      (!options?.language && doc.pdf_storage_key) 
        ? doc.pdf_storage_key 
        : `documents/${documentId}/source.${targetLanguage}.pdf`
    // Check if PDF already exists in storage (use admin client to bypass RLS)
    const { data: existingFile, error: listError } = await adminClient.storage
      .from("business-assets")
      .list(`documents/${documentId}`, {
        limit: 1,
        search: storageKey.split("/").pop() || "source.pdf"
      })
    if (existingFile && existingFile.length > 0) {      console.log(`[generateDocumentPDF] PDF already exists for document ${documentId}, returning existing`)
      
      return {
        success: true,
        path: storageKey, // Return storage key (bucket is private)
        storageKey: storageKey, // Explicit storageKey field
        buffer: undefined, // Don't return buffer if already exists
      }
    }

    // 8. Upload PDF to Supabase Storage using admin client (bypasses RLS)
    // Use service role key to upload - this bypasses RLS policies
    console.log(
      `[generateDocumentPDF] Uploading PDF to storage for document ${documentId}, path: ${storageKey}, size: ${finalPdfBuffer.length} bytes`
    )    
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from("business-assets")
      .upload(storageKey, finalPdfBuffer, {
        contentType: "application/pdf",
        upsert: false, // Never overwrite - immutable
      })
    if (uploadError) {
      const errorMessage = uploadError.message || "Unknown upload error"
      const errorName = uploadError.name || "StorageError"
      const errorStatus = (uploadError as any)?.status || (uploadError as any)?.statusCode || "N/A"
      
      console.error(`[generateDocumentPDF] Storage upload failed for document ${documentId}:`, {
        error: errorMessage,
        errorName,
        errorStatus,
        storageKey,
        documentId,
        bufferSize: finalPdfBuffer.length
      })      
      // If error is "already exists", that's fine - return existing storage key
      if (uploadError.message.includes("already exists") || uploadError.message.includes("duplicate")) {
        console.log(`[generateDocumentPDF] PDF already exists in storage for document ${documentId}, returning existing storage key`)
        return {
          success: true,
          path: storageKey, // Return storage key (bucket is private)
          storageKey: storageKey, // Explicit storageKey field
          buffer: finalPdfBuffer,
        }
      }
      
      return {
        success: false,
        error: `Failed to upload PDF to storage: ${errorMessage} (${errorName}, status: ${errorStatus})`,
      }
    }

    console.log(`[generateDocumentPDF] PDF uploaded successfully to storage for document ${documentId}, path: ${storageKey}`)

    // 9. Calculate SHA256 checksum for integrity verification
    const crypto = await import("crypto")
    const pdfSha256 = signingInfo?.signedPdfSha256 || crypto.createHash("sha256").update(finalPdfBuffer as any).digest("hex")

    // 10. Note: Bucket is private, so we don't use getPublicUrl
    // PDFs are accessed via signed URLs only (created in API route)
    const shouldPersistPdfStorageKey =
      (pdfMode === "final" || pdfMode === "recovery") && targetLanguage === "he"

    // 11. Persist PDF metadata only for the document's base language.
    // IMPORTANT: When generating an alternate-language PDF (e.g. downloading EN for a HE document),
    // we must NOT overwrite `documents.pdf_storage_key` (it should keep pointing to the base PDF).
    let updateError: any = null
    if (shouldPersistPdfStorageKey) {
      console.log(`[generateDocumentPDF] Updating document ${documentId} with pdf_storage_key: ${storageKey}`)
      const nowIso = new Date().toISOString()
      const res = await adminClient
        .from("documents")
        .update({
          pdf_storage_key: storageKey, // Store storage key only (no public URL - bucket is private)
          pdf_generated_at: nowIso,
          pdf_sha256: pdfSha256,
          signed_pdf_sha256: signingInfo?.signedPdfSha256 || null,
          signing_cert_fingerprint: signingInfo?.certFingerprintSha256 || null,
          signed_at: signingInfo ? nowIso : null,
          signature_provider: signingInfo ? "p12" : null,
          signature_certificate_id: signingInfo?.certFingerprintSha256 || null,
          signed_hash: signingInfo?.signedPdfSha256 || null,
          template_version_id: template.templateId || null, // Snapshot template version
          updated_at: nowIso,
          // DO NOT update document_status here - it will be set to 'final' by finalizeDocument
        })
        .eq("id", documentId)
      updateError = res.error
    } else {
      console.log(`[generateDocumentPDF] Skipping pdf_storage_key DB update (alternate language PDF):`, {
        documentId,
        docLanguage: (doc as any)?.language || "he",
        requestedLanguage: options?.language,
        storageKey,
      })
    }
    // CRITICAL: Even if DB update fails, PDF exists in Storage - return success with storageKey
    // The API route will use storageKey directly, not relying on DB
    if (updateError) {
      console.warn(`[generateDocumentPDF] Failed to update document ${documentId} with PDF metadata (DB may block updates to finalized documents):`, {
        error: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
        documentId,
        storageKey
      })
      // PDF exists in Storage - return success anyway
      // API route will use storageKey directly without checking DB
      console.log(`[generateDocumentPDF] ⚠️ PDF uploaded to Storage but DB update failed. Returning storageKey anyway: ${storageKey}`)
      return {
        success: true,
        path: storageKey,
        storageKey: storageKey, // Explicit storageKey field - API route will use this
        buffer: finalPdfBuffer,
      }
    }

    // Verify that pdf_storage_key was saved correctly (optional - only when we persisted it)
    if (!shouldPersistPdfStorageKey) {
      return {
        success: true,
        path: storageKey,
        storageKey: storageKey,
        buffer: finalPdfBuffer,
      }
    }

    const { data: verifyDoc, error: verifyError } = await adminClient
      .from("documents")
      .select("pdf_storage_key, pdf_generated_at, document_status")
      .eq("id", documentId)
      .single()

    if (verifyError || !verifyDoc) {
      // DB verification failed, but PDF exists in Storage - return success anyway
      console.warn(`[generateDocumentPDF] Failed to verify pdf_storage_key in DB for document ${documentId}, but PDF exists in Storage:`, verifyError)
      return {
        success: true,
        path: storageKey,
        storageKey: storageKey, // Use storageKey from upload - API route will use this
        buffer: finalPdfBuffer,
      }
    }

    // Log verification result (but don't fail if mismatch - PDF exists in Storage)
    if (verifyDoc.pdf_storage_key !== storageKey) {
      console.warn(`[generateDocumentPDF] pdf_storage_key mismatch for document ${documentId} (but PDF exists in Storage):`, {
        expected: storageKey,
        actual: verifyDoc.pdf_storage_key,
        documentId
      })
      // Still return success - PDF exists in Storage, API route will use storageKey from result
    } else {
      console.log(`[generateDocumentPDF] ✅ PDF generation completed successfully for document ${documentId}:`, {
        storageKey: verifyDoc.pdf_storage_key,
        pdfGeneratedAt: verifyDoc.pdf_generated_at,
        documentStatus: verifyDoc.document_status
      })
    }

    return {
      success: true,
      path: storageKey, // Return storage key (not public URL - bucket is private)
      storageKey: storageKey, // Explicit storageKey field for API route
      buffer: finalPdfBuffer,
    }
  } catch (error: any) {
    const errorMessage = error?.message || String(error)
    const errorStack = error?.stack || "No stack trace"
    const errorName = error?.name || error?.constructor?.name || typeof error
    
    console.error(`[generateDocumentPDF] Exception during PDF generation for document ${documentId}:`, {
      error: errorMessage,
      errorName,
      stack: errorStack,
      documentId,
      errorType: typeof error,
      supabaseError: error?.code ? { code: error.code, message: error.message, details: error.details } : null,
      storageError: error?.status ? { status: error.status, message: error.message } : null
    })
    
    // Preserve stable error codes for callers (routes may map these to 400).
    if (
      typeof errorMessage === "string" &&
      (errorMessage.startsWith("TEMPLATE_MISSING_LANGUAGE:") || errorMessage.startsWith("ORIGINAL_MUST_BE_HE"))
    ) {
      return { success: false, error: errorMessage }
    }

    return { success: false, error: `PDF generation exception: ${errorMessage} (${errorName})` }
  }
}

// ==================== PREVIEW GENERATION (No Storage) ====================

/**
 * Generate PDF preview for a draft document (doesn't save to storage)
 * Used for live preview in the UI
 */
export async function generatePreviewPDF(
  documentId: string,
  options?: {
    language?: "he" | "en";
  }
): Promise<PDFGenerationResult> {  
  try {
    console.log(`[generatePreviewPDF] Starting for document: ${documentId}`)
    
    const targetLanguage: "he" | "en" = options?.language || "he"
    // Prepare document data (preview is not "original" and not "copy")
    const templateData = await prepareDocumentData(documentId, targetLanguage, { documentCopyLabel: "" })
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
    const template = await getTemplateForDocument(doc.company_id, doc.document_type as any, {
      language: targetLanguage,
      allowFallbackToHe: true,
    })
    if (template.didFallbackToHe) {
      console.warn("[PDF PREVIEW] Template fallback to HE (missing EN variant)", {
        documentId: documentId.substring(0, 8),
        requestedLanguage: targetLanguage,
      })
    }
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
