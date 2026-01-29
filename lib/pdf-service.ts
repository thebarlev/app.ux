"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import path from "node:path"
import { readFile } from "node:fs/promises"
import { isPdfDebugEnabled, logPdfEvent, type PdfLogContext } from "@/lib/pdf-logger"
import { 
  compileAndRender, 
  compileTemplate,
  generatePDFFromHTML, 
  validateTemplate 
} from "@/lib/template-engine"
import { getDefaultGenericDocumentTemplate, getDefaultReceiptTemplate } from "@/lib/default-templates"
import { getPageTexts } from "@/lib/system-texts"
import { signPdfWithEnvP12 } from "@/lib/documents/signing/p12-signer"
import { isDigitalSignaturesEnabled } from "@/lib/documents/signing/feature-flags"
import type { 
  TemplateDefinition, 
  ReceiptTemplateData,
  PDFGenerationResult 
} from "@/lib/types/template"

// ==================== PDF CSS/FONT INLINING (for link-stripped HTML) ====================
// NOTE: `generatePDFFromHTML` strips all <link rel="stylesheet" ...> from FULL HTML documents,
// so templates that rely on link-based CSS/Google Fonts will lose styling/fonts in PDFs.
// We compensate by folding known link-based assets into the returned `css` from `getTemplateForDocument`.

let cachedReceiptStandardCss: string | null = null
let cachedReceiptStandardCssLoadError: string | null = null

async function loadReceiptStandardCss(): Promise<string> {
  if (cachedReceiptStandardCss !== null) return cachedReceiptStandardCss
  if (cachedReceiptStandardCssLoadError) return ""

  try {
    const cssPath = path.join(
      process.cwd(),
      "templates",
      "receipt",
      "standard",
      "receipt-standard-styles.css"
    )
    cachedReceiptStandardCss = await readFile(cssPath, "utf8")
    return cachedReceiptStandardCss
  } catch (e: any) {
    cachedReceiptStandardCssLoadError = e?.message || String(e)
    console.warn("[TEMPLATE_FETCH] Failed to load receipt-standard-styles.css:", cachedReceiptStandardCssLoadError)
    cachedReceiptStandardCss = ""
    return ""
  }
}

function htmlHasReceiptStandardStylesheetLink(html: string): boolean {
  // Matches: href="receipt-standard-styles.css" or "./receipt-standard-styles.css" or "/receipt-standard-styles.css"
  return /<link[^>]*rel=["']stylesheet["'][^>]*href=["'](?:\.\/|\/)?receipt-standard-styles\.css["'][^>]*>/i.test(
    html
  )
}

function htmlHasAssistantGoogleFontsStylesheetLink(html: string): boolean {
  // Matches any stylesheet link that loads Assistant from Google Fonts.
  return /<link[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*fonts\.googleapis\.com\/css2\?[^"']*family=Assistant/i.test(
    html
  )
}

function cssAlreadyImportsAssistant(css: string): boolean {
  return /fonts\.googleapis\.com\/css2\?[^'")]*family=Assistant/i.test(css) || /font-family:\s*["']Assistant["']/i.test(css)
}

async function augmentCssForLinkStrippedPdf(html: string, css: string): Promise<string> {
  let nextCss = css || ""
  let prefix = ""

  // 1) Google Fonts Assistant: convert <link rel="stylesheet" ...> into @import (must be at top of CSS).
  if (htmlHasAssistantGoogleFontsStylesheetLink(html) && !cssAlreadyImportsAssistant(nextCss)) {
    prefix += `@import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&display=swap');\n`
  }

  // 2) receipt-standard-styles.css: inline from repo so PDF keeps styling after <link> stripping.
  if (htmlHasReceiptStandardStylesheetLink(html)) {
    const marker = "/* __inlined:receipt-standard-styles.css */"
    if (!nextCss.includes(marker)) {
      const receiptCss = await loadReceiptStandardCss()
      if (receiptCss.trim().length > 0) {
        // IMPORTANT:
        // The template's own CSS (`css` argument) must remain the source of truth.
        // So if a template includes the standard stylesheet link, we inline it *before*
        // the template CSS, allowing the template to override layout/margins/paddings.
        nextCss = `${marker}\n${receiptCss}\n/* __end_inlined:receipt-standard-styles.css */\n\n${nextCss}`
      }
    }
  }

  // Keep @import at the very top.
  if (prefix) {
    nextCss = `${prefix}${nextCss}`
  }

  return nextCss
}

const TAX_INVOICE_LIKE_TYPES = new Set([
  "tax_invoice",
  "invoiceReceipt",
  "invoice_receipt",
  "credit_note",
  "quote",
  "proforma",
  "work_order",
  "delivery_note",
  "return_note",
  "purchase_order",
  "self_invoice",
  "self_credit_note",
]);

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: "קבלה",
  tax_invoice: "חשבונית מס",
  invoiceReceipt: "חשבונית מס / קבלה",
  invoice_receipt: "חשבונית מס / קבלה",
  credit_note: "חשבונית זיכוי",
  quote: "הצעת מחיר",
  proforma: "חשבון עסקה (דרישת תשלום)",
  work_order: "הזמנת עבודה",
  delivery_note: "תעודת משלוח",
  return_note: "תעודת החזרה",
  purchase_order: "הזמנת רכש",
  self_invoice: "חשבונית עצמית",
  self_credit_note: "חשבונית זיכוי עצמית",
};

const isTaxInvoiceLike = (documentType: string) => TAX_INVOICE_LIKE_TYPES.has(documentType);
const isInvoiceReceiptType = (documentType: string) =>
  documentType === "invoiceReceipt" || documentType === "invoice_receipt";

const TEMPLATE_TYPE_ALIASES: Record<string, string> = {
  invoiceReceipt: "tax_invoice",
  invoice_receipt: "tax_invoice",
  credit_note: "tax_invoice",
  quote: "tax_invoice",
  proforma: "tax_invoice",
  work_order: "tax_invoice",
  delivery_note: "tax_invoice",
  return_note: "tax_invoice",
  purchase_order: "tax_invoice",
  self_invoice: "tax_invoice",
  self_credit_note: "tax_invoice",
};

const resolveTemplateDocumentType = (documentType: string) =>
  TEMPLATE_TYPE_ALIASES[documentType] || documentType;

// ==================== TEMPLATE FETCHING ====================

/**
 * Get template for document type (company-specific or global default)
 * Priority:
 * 0) User's explicit selection from settings (company_template_selections)
 * 1) Company's default template (is_default = TRUE for this company)
 * 2) Global default template (is_default = TRUE, company_id IS NULL)
 * 3) Any active company template for this document type
 * 4) Any active global template for this document type
 * 5) Hardcoded fallback
 */
export async function getTemplateForDocument(
  companyId: string,
  documentType:
    | "receipt"
    | "tax_invoice"
    | "invoiceReceipt"
    | "credit_note"
    | "quote"
    | "proforma"
    | "work_order"
    | "delivery_note"
    | "return_note"
    | "purchase_order"
    | "self_invoice"
    | "self_credit_note"
    | "invoice",
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
  const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true'
  const templateDocumentType = resolveTemplateDocumentType(documentType)

  if (DEBUG_TEMPLATES) {
    console.log("[TEMPLATE_FETCH] getTemplateForDocument called:", {
      companyId,
      documentType,
      language,
      allowFallbackToHe
    })

    // Diagnostic: compare what the user-session (RLS) can see vs what admin/service role can see.
    // This proves whether the issue is RLS visibility vs missing/mismatched data.
    try {
      const { data: rlsVisible, error: rlsError } = await supabase
        .from("templates")
        .select("id, name, document_type, company_id, is_active, is_default, created_at")
        .eq("document_type", documentType)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      console.log("[TEMPLATE_FETCH] RLS-visible active templates for type:", {
        documentType,
        count: rlsVisible?.length || 0,
        error: rlsError?.message,
        templates: (rlsVisible || []).slice(0, 10).map((t: any) => ({
          id: String(t.id).substring(0, 8),
          name: t.name,
          company_id: t.company_id ? String(t.company_id).substring(0, 8) : "global",
          is_default: t.is_default,
        })),
      })
    } catch (e: any) {
      console.warn("[TEMPLATE_FETCH] Failed to fetch RLS-visible templates (diagnostic):", e?.message || e)
    }

    try {
      const admin = createAdminClient()
      const { data: adminVisible, error: adminError } = await admin
        .from("templates")
        .select("id, name, document_type, company_id, is_active, is_default, created_at")
        .eq("document_type", documentType)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      console.log("[TEMPLATE_FETCH] Admin-visible active templates for type:", {
        documentType,
        count: adminVisible?.length || 0,
        error: adminError?.message,
        templates: (adminVisible || []).slice(0, 10).map((t: any) => ({
          id: String(t.id).substring(0, 8),
          name: t.name,
          company_id: t.company_id ? String(t.company_id).substring(0, 8) : "global",
          is_default: t.is_default,
        })),
      })
    } catch (e: any) {
      console.warn("[TEMPLATE_FETCH] Failed to fetch admin-visible templates (diagnostic):", e?.message || e)
    }
  }

  // Resolve multi-document type mappings (templates linked via junction table)
  let mappedTemplateIds: string[] = []
  try {
    const { data: mappedRows, error: mappedError } = await supabase
      .from("template_document_types")
      .select("template_id")
      .eq("document_type", templateDocumentType)

    if (!mappedError && mappedRows && mappedRows.length > 0) {
      mappedTemplateIds = Array.from(
        new Set(mappedRows.map((row: any) => row.template_id).filter(Boolean))
      )
    }
  } catch (e: any) {
    if (DEBUG_TEMPLATES) {
      console.warn("[TEMPLATE_FETCH] Failed to load template_document_types mappings:", e?.message || e)
    }
  }

  const pickVariant = (row: any) => {
    // Strict language gating:
    // - Hebrew source: html_template/css
    // - English source: html_en/css_en
    // Non-negotiable:
    // - Use English ONLY when language === "en"
    // - If language === "en" but html_en missing/empty -> fallback to Hebrew and set resolvedLanguage="he"
    const heHtml: string | null = row?.html_template ?? row?.html ?? null
    const heCss: string = row?.css ?? ""
    const enHtml: string | null = row?.html_en ?? null
    const enCss: string | null = row?.css_en ?? null

    if (language === "en") {
      if (typeof enHtml === "string" && enHtml.trim().length > 0) {
        const css = typeof enCss === "string" && enCss.trim().length > 0 ? enCss : heCss
        return { html: enHtml, css: css || "", resolvedLanguage: "en" as const, didFallbackToHe: false }
      }

      // Fallback (chosen by user): render Hebrew when English is missing/empty
      if (typeof heHtml === "string" && heHtml.trim().length > 0) {
        return { html: heHtml, css: heCss || "", resolvedLanguage: "he" as const, didFallbackToHe: true }
      }

      throw new Error("TEMPLATE_MISSING_LANGUAGE:he")
    }

    // language !== "en" -> ALWAYS Hebrew
    if (typeof heHtml === "string" && heHtml.trim().length > 0) {
      return { html: heHtml, css: heCss || "", resolvedLanguage: "he" as const, didFallbackToHe: false }
    }
    throw new Error("TEMPLATE_MISSING_LANGUAGE:he")
  }

  const pickVariantChecked = (row: any, stage: string) => {
    const picked = pickVariant(row)
    try {
      // Compile-only check to catch syntax errors (unclosed blocks, etc.)
      compileTemplate(picked.html)
      return picked
    } catch (e: any) {
      console.warn("⚠️ Skipping invalid template (syntax error)", {
        stage,
        documentType,
        templateDocumentType,
        templateId: row?.id || null,
        templateName: row?.name || null,
        error: e?.message || String(e),
      })
      return null
    }
  }

  const finalizePicked = async (
    picked: { html: string; css: string; resolvedLanguage: "he" | "en"; didFallbackToHe: boolean },
    templateId: string | null
  ) => {
    const augmentedCss = await augmentCssForLinkStrippedPdf(picked.html, picked.css || "")
    return { ...picked, css: augmentedCss, templateId }
  }

  // PRIORITY 0: User's explicit selection from settings (highest priority)
  const { data: userSelection } = await supabase
    .from("company_template_selections")
    .select("template_id")
    .eq("company_id", companyId)
    .eq("document_type", templateDocumentType)
    .maybeSingle()

  if (DEBUG_TEMPLATES) {
    console.log("[TEMPLATE_FETCH] PRIORITY 0 - userSelection:", {
      found: !!userSelection,
      templateId: userSelection?.template_id
    })
  }

  if (userSelection?.template_id) {
    const { data: selectedTemplate } = await supabase
      .from("templates")
      .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_en, css_en")
      .eq("id", userSelection.template_id)
      .eq("is_active", true)
      .maybeSingle()

    if (selectedTemplate) {
      console.log(`✅ Using user-selected template from settings: ${selectedTemplate.name || selectedTemplate.id} (${selectedTemplate.id})`)
      if (DEBUG_TEMPLATES) {
        console.log("[TEMPLATE_FETCH] Selected template details:", {
          id: selectedTemplate.id,
          name: selectedTemplate.name,
          hasHtml: !!(selectedTemplate as any).html_template,
          htmlLength: ((selectedTemplate as any).html_template || "").length,
          hasCss: !!(selectedTemplate as any).css,
          cssLength: ((selectedTemplate as any).css || "").length,
          isActive: selectedTemplate.is_active
        })
      }
      const picked = pickVariantChecked(selectedTemplate, "PRIORITY_0_USER_SELECTION")
      if (picked) {
        return await finalizePicked(picked, selectedTemplate.id)
      }
    } else {
      // Selection exists but template is inactive or deleted - log warning and continue to fallbacks
      console.warn(`⚠️ User selected template ${userSelection.template_id} is inactive or not found, falling back to defaults`)
    }
  }

  // PRIORITY 1: Company's default template
  const { data: companyDefault } = await supabase
    .from("templates")
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_en, css_en")
    .eq("company_id", companyId)
    .eq("document_type", templateDocumentType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle()

  if (DEBUG_TEMPLATES) {
    console.log("[TEMPLATE_FETCH] PRIORITY 1 - companyDefault:", {
      found: !!companyDefault,
      templateId: companyDefault?.id
    })
  }

  if (companyDefault) {
    console.log(`✅ Using company default template: ${companyDefault.id}`)
    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] Company default template details:", {
        id: companyDefault.id,
        hasHtml: !!(companyDefault as any).html_template,
        htmlLength: ((companyDefault as any).html_template || "").length,
        hasCss: !!(companyDefault as any).css,
        cssLength: ((companyDefault as any).css || "").length
      })
    }
    const picked = pickVariantChecked(companyDefault, "PRIORITY_1_COMPANY_DEFAULT")
    if (picked) {
      return await finalizePicked(picked, companyDefault.id)
    }
  }

  // PRIORITY 2: Global default template
  const { data: globalDefault, error: globalDefaultError } = await supabase
    .from("templates")
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_en, css_en")
    .is("company_id", null)
    .eq("document_type", documentType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle()

  if (DEBUG_TEMPLATES) {
    const RUN_ID = process.env.DEBUG_TEMPLATES_RUN_ID || "pre-fix"

    // 1) Exact PRIORITY 2 query result: { data, error }
    console.log(`[TEMPLATE_FETCH][runId=${RUN_ID}] PRIORITY 2 raw query result:`, {
      data: globalDefault
        ? {
            id: globalDefault.id,
            name: (globalDefault as any).name,
            company_id: (globalDefault as any).company_id,
            company_id_typeof: typeof (globalDefault as any).company_id,
            document_type: (globalDefault as any).document_type,
            is_default: (globalDefault as any).is_default,
            is_active: (globalDefault as any).is_active,
          }
        : null,
      error: globalDefaultError
        ? {
            message: globalDefaultError.message,
            code: (globalDefaultError as any).code,
            details: (globalDefaultError as any).details,
            hint: (globalDefaultError as any).hint,
          }
        : null,
    })

    // 2) Verification count query: how many rows match the PRIORITY 2 filters (under RLS)
    const { count: verifyCount, error: verifyCountError } = await supabase
      .from("templates")
      .select("id", { count: "exact", head: true })
      .is("company_id", null)
      .eq("document_type", documentType)
      .eq("is_default", true)
      .eq("is_active", true)

    console.log(`[TEMPLATE_FETCH][runId=${RUN_ID}] PRIORITY 2 verify count (RLS):`, {
      count: verifyCount ?? null,
      error: verifyCountError
        ? {
            message: verifyCountError.message,
            code: (verifyCountError as any).code,
            details: (verifyCountError as any).details,
            hint: (verifyCountError as any).hint,
          }
        : null,
    })

    // 3) Candidate global rows (limit 5) to validate company_id values
    const { data: globalCandidates5, error: globalCandidates5Error } = await supabase
      .from("templates")
      .select("id, name, company_id, is_default, is_active, document_type, created_at")
      .is("company_id", null)
      .eq("document_type", documentType)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(5)

    console.log(`[TEMPLATE_FETCH][runId=${RUN_ID}] PRIORITY 2 candidates (company_id IS NULL, limit 5):`, {
      length: globalCandidates5?.length || 0,
      error: globalCandidates5Error
        ? {
            message: globalCandidates5Error.message,
            code: (globalCandidates5Error as any).code,
            details: (globalCandidates5Error as any).details,
            hint: (globalCandidates5Error as any).hint,
          }
        : null,
      rows: (globalCandidates5 || []).map((t: any) => ({
        id8: String(t.id).substring(0, 8),
        name: t.name,
        company_id: t.company_id,
        company_id_typeof: typeof t.company_id,
        is_default: !!t.is_default,
        is_active: !!t.is_active,
        document_type: t.document_type,
      })),
    })

    // Diagnostic: count how many *global* active templates exist for this type under RLS.
    // (This checks the user's visibility; admin-visible list is already logged above.)
    try {
      const { data: rlsGlobalList, error: rlsGlobalErr } = await supabase
        .from("templates")
        .select("id, name, company_id, is_default, is_active")
        .eq("document_type", documentType)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      const isGlobal = (cid: string | null) => cid === null || cid === "global"
      const globalCandidates = (rlsGlobalList || []).filter((t: any) => isGlobal(t.company_id))
      const globalDefaults = globalCandidates.filter((t: any) => !!t.is_default)

      console.log("[TEMPLATE_FETCH] PRIORITY 2 diagnostic (RLS list):", {
        documentType,
        rlsCount: rlsGlobalList?.length || 0,
        rlsError: rlsGlobalErr?.message,
        globalCandidatesCount: globalCandidates.length,
        globalDefaultsCount: globalDefaults.length,
        globalDefaultIds8: globalDefaults.slice(0, 5).map((t: any) => String(t.id).substring(0, 8)),
      })

    } catch (e: any) {
      console.warn("[TEMPLATE_FETCH] PRIORITY 2 diagnostic failed:", e?.message || e)
    }

    console.log("[TEMPLATE_FETCH] PRIORITY 2 - globalDefault:", {
      found: !!globalDefault,
      templateId: globalDefault?.id,
      name: globalDefault?.name,
      error: globalDefaultError?.message,
    })

  }

  if (globalDefault) {
    console.log(`✅ Using global default template: ${globalDefault.name} (${globalDefault.id})`)
    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] Global default template details:", {
        id: globalDefault.id,
        name: globalDefault.name,
        hasHtml: !!(globalDefault as any).html_template,
        htmlLength: ((globalDefault as any).html_template || "").length,
        hasCss: !!(globalDefault as any).css,
        cssLength: ((globalDefault as any).css || "").length
      })
    }
    const picked = pickVariantChecked(globalDefault, "PRIORITY_2_GLOBAL_DEFAULT")
    if (picked) {
      return await finalizePicked(picked, globalDefault.id)
    }
  }

  // PRIORITY 3: Any active company template (fallback)
  const { data: anyCompanyTemplate } = await supabase
    .from("templates")
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_en, css_en")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (anyCompanyTemplate) {
    console.log(`⚠️ Using fallback company template: ${anyCompanyTemplate.id}`)
    const picked = pickVariantChecked(anyCompanyTemplate, "PRIORITY_3_ANY_COMPANY")
    if (picked) {
      return await finalizePicked(picked, anyCompanyTemplate.id)
    }
  }

  // PRIORITY 4: Any active global template (fallback)
  const { data: anyGlobalTemplate } = await supabase
    .from("templates")
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_en, css_en")
    .is("company_id", null)
    .eq("document_type", documentType)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (anyGlobalTemplate) {
    console.log(`⚠️ Using fallback global template: ${anyGlobalTemplate.name} (${anyGlobalTemplate.id})`)
    const picked = pickVariantChecked(anyGlobalTemplate, "PRIORITY_4_ANY_GLOBAL")
    if (picked) {
      return await finalizePicked(picked, anyGlobalTemplate.id)
    }
  }

  // PRIORITY 4.5: Any active mapped template (company first, then global)
  if (mappedTemplateIds.length > 0) {
    const { data: mappedCompanyTemplate } = await supabase
      .from("templates")
      .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_en, css_en")
      .eq("company_id", companyId)
      .in("id", mappedTemplateIds)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (mappedCompanyTemplate) {
      console.log(`⚠️ Using mapped company template: ${mappedCompanyTemplate.id}`)
      const picked = pickVariantChecked(mappedCompanyTemplate, "PRIORITY_4_5_MAPPED_COMPANY")
      if (picked) {
        return await finalizePicked(picked, mappedCompanyTemplate.id)
      }
    }

    const { data: mappedGlobalTemplate } = await supabase
      .from("templates")
      .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_en, css_en")
      .is("company_id", null)
      .in("id", mappedTemplateIds)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (mappedGlobalTemplate) {
      console.log(`⚠️ Using mapped global template: ${mappedGlobalTemplate.name} (${mappedGlobalTemplate.id})`)
      const picked = pickVariantChecked(mappedGlobalTemplate, "PRIORITY_4_5_MAPPED_GLOBAL")
      if (picked) {
        return await finalizePicked(picked, mappedGlobalTemplate.id)
      }
    }
  }

  // PRIORITY 5: Final fallback - Use hardcoded default template(s)
  if (documentType === "receipt") {
    console.log(`⚠️ Using hardcoded fallback template for receipt`)
    const defaultTemplate = getDefaultReceiptTemplate()
    if (language === "en" && !allowFallbackToHe) {
      throw new Error("TEMPLATE_MISSING_LANGUAGE:en")
    }
    return await finalizePicked({
      html: defaultTemplate.html,
      css: defaultTemplate.css,
      resolvedLanguage: "he",
      didFallbackToHe: language === "en",
    }, null)
  }

  console.log(`⚠️ Using hardcoded generic fallback template for document type: ${documentType}`)
  const generic = getDefaultGenericDocumentTemplate()
  return await finalizePicked(
    {
      html: generic.html,
      css: generic.css,
      resolvedLanguage: "he",
      didFallbackToHe: language === "en",
    },
    null
  )
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
        english_address,
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
      msg.includes("company_name_en") || msg.includes("contact_first_name_en") || msg.includes("english_address")
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
    if (isTaxInvoiceLike(doc.document_type)) {
      return {
        payment_method: metadata.label || item.description || "",
        date: item.item_date || doc.issue_date || "",
        amount: parseFloat(item.line_total || item.unit_price || 0),
        currency: item.currency || doc.currency || "₪",
        reference_number: metadata.sku || null,
        notes: metadata.details || null,
        bank_name: null,
        branch: null,
        account_number: null,
        check_number: null,
        card_last4: null,
        transaction_id: null,
        payerAccount: null,
        cardInstallments: null,
        cardDealType: null,
        cardType: null,
      }
    }
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
      const formatted = new Intl.NumberFormat(documentLanguage === "en" ? "en-US" : "he-IL", {
        style: "currency",
        currency: currencyCode,
        currencyDisplay: documentLanguage === "en" ? "code" : "narrowSymbol",
      }).format(amount)
      return formatted
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

  // Map stored payment method (Hebrew values from DB) to English for English PDFs.
  const mapPaymentMethodForDisplay = (raw: any): string => {
    const s = typeof raw === "string" ? raw.trim() : ""
    if (!s) return ""

    if (documentLanguage !== "en") return s

    const map: Record<string, string> = {
      "העברה בנקאית": "Bank Transfer",
      "כרטיס אשראי": "Credit Card",
      "מזומן": "Cash",
      "צ׳ק": "Check",
      "ביטקוין": "Bitcoin",
      "אתריום": "Ethereum",
      "שובר BuyME": "BuyME Voucher",
      "שובר מתנה": "Gift Voucher",
      "שווה כסף": "Cash Equivalent",
      "ניכוי במקור": "Withholding Tax",
      "ניכוי חלק עובד טל״א": "Employee Deduction",
      "ניכוי אחר": "Other Deduction",
    }

    const mapped = map[s]
    if (mapped) return mapped

    // These are already English/brand strings in the DB.
    if (/[A-Za-z]/.test(s)) return s

    // Ensure no Hebrew leaks into EN PDF for method field.
    const hasHebrew = /[\u0590-\u05FF]/.test(s)
    return hasHebrew ? "Other" : s
  }

  // Enhanced payment details builder - includes all relevant fields from user input
  const buildPaymentDetails = (p: any) => {
    const parts: string[] = []
    const includedKeys: string[] = []
    const isEn = documentLanguage === "en"
    const hasCheck = !!p.check_number
    const hasRef = !!p.reference_number
    const hasTxn = !!p.transaction_id
    const hasNotes = !!p.notes
    const hasBank = !!p.bank_name
    const hasBranch = !!p.branch
    const hasAccount = !!p.account_number
    const dupCheckRef = hasCheck && hasRef && String(p.check_number) === String(p.reference_number)
    
    // Reference number / Transaction ID
    if (p.reference_number && !(dupCheckRef && p.check_number)) {
      parts.push(p.reference_number)
      includedKeys.push("reference_number")
    }
    if (p.transaction_id && p.transaction_id !== p.reference_number) {
      parts.push(`${p.transaction_id}`)
      includedKeys.push("transaction_id")
    }
    
    // Bank transfer details
    if (p.bank_name) {
      parts.push(p.bank_name)
      includedKeys.push("bank_name")
    }
    if (p.branch) {
      parts.push(`${p.branch}`)
      includedKeys.push("branch")
    }
    if (p.account_number) {
      parts.push(`${p.account_number}`)
      includedKeys.push("account_number")
    }
    
    // Digital wallet / Payer account
    if (p.payerAccount) {
      parts.push(`${p.payerAccount}`)
      includedKeys.push("payerAccount")
    }
    
    // Check details
    if (p.check_number) {
      parts.push(`${p.check_number}`)
      includedKeys.push("check_number")
    }
    
    // Credit card details - all fields from user input
    if (p.card_last4) {
      const cardParts: string[] = [`*${p.card_last4}`]
      if (p.cardType) cardParts.push(p.cardType)
      if (p.cardDealType) {
        const dealTypeMap: Record<string, string> = isEn
          ? {
              regular: "Regular",
              payments: "Installments",
              credit: "Credit",
              deferred: "Deferred",
            }
          : {
              regular: "רגיל",
              payments: "תשלומים",
              credit: "אשראי",
              deferred: "דחוי",
            }
        cardParts.push(dealTypeMap[p.cardDealType] || p.cardDealType)
      }
      if (p.cardInstallments) cardParts.push(`${p.cardInstallments}`)
      parts.push(cardParts.join(", "))
      includedKeys.push("card_last4")
    }
    
    // Notes / Description
    if (p.notes) {
      parts.push(p.notes)
      includedKeys.push("notes")
    }
    
    const joined = parts.join(", ").trim()

    return joined
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
      method: mapPaymentMethodForDisplay(p.payment_method || ""),
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

  // Build company address:
  // - English PDF: use ONLY companies.english_address; if missing/empty => hide address block (no fallback to Hebrew)
  // - Hebrew PDF: use street/city/postal_code when available, otherwise companies.address
  let companyAddress = ""
  if (documentLanguage === "en") {
    const en = (doc.company as any)?.english_address
    companyAddress = typeof en === "string" ? en.trim() : ""
  } else {
    companyAddress = doc.company?.address || ""
    if (doc.company?.street || doc.company?.city) {
      const addressParts: string[] = []
      if (doc.company.street) addressParts.push(doc.company.street)
      if (doc.company.city) addressParts.push(doc.company.city)
      if (doc.company.postal_code) addressParts.push(doc.company.postal_code)
      if (addressParts.length > 0) {
        companyAddress = addressParts.join(", ")
      }
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
  const resolvedCustomerName = doc.customer?.name || doc.customer_name || ""
  
  // Check if any item has SKU data (non-empty sku field)
  const hasSkuData = (items || []).some((item: any) => {
    const sku = item.item_sku || null
    return sku && String(sku).trim().length > 0
  })
  
  const templateData: ReceiptTemplateData & Record<string, any> = {
    t,
    DOCUMENT_COPY_LABEL: options?.documentCopyLabel ?? "",
    HAS_SKU_DATA: hasSkuData, // ✅ משתנה חדש - האם יש מק"ט בשורות
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
    } as any,
    customer: doc.customer ? {
      customer_name: resolvedCustomerName,
      customer_tax_id: doc.customer.tax_id || null,
      customer_email: doc.customer.email || null,
      customer_phone: customerPhone,
      customer_address: customerAddress,
    } : {
      customer_name: resolvedCustomerName,
    },
    document: {
      document_type: doc.document_type as any,
      document_type_label: DOCUMENT_TYPE_LABELS[doc.document_type] || "קבלה",
      document_number: doc.document_number || "",
      document_date: doc.issue_date || "",
      reference_number: null,
      language: documentLanguage,
      direction: documentLanguage === "en" ? "ltr" : "rtl",
    } as any,
    document_type: doc.document_type as any,
    document_type_label: DOCUMENT_TYPE_LABELS[doc.document_type] || "קבלה",
    payments: mappedPayments,
    items: (items || []).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_price),
      amount: parseFloat(item.line_total),
      total_price: parseFloat(item.line_total),
      vat_rate: doc.vat_rate ? parseFloat(doc.vat_rate) : undefined,
      notes: item.notes || null,
      sku: item.item_sku || null, // ✅ הוסף מק"ט
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
    CLIENTNAME: resolvedCustomerName,
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
    customer_name: resolvedCustomerName,
    customer_tax_id: doc.customer?.tax_id || "",
    customer_phone: customerPhone || "",
    customer_address: customerAddress || "",
    document_number: doc.document_number || "",
    document_date: formatDate(doc.issue_date),
    document_language: documentLanguage,
    subtotal: formatCurrency(doc.subtotal ? parseFloat(doc.subtotal) : 0),
    vat_rate: doc.vat_rate ? parseFloat(doc.vat_rate) : undefined,
    vat_amount: formatCurrency(doc.vat_amount ? parseFloat(doc.vat_amount) : 0),
    total_amount: formatCurrency(parseFloat(doc.total_amount || 0)),
    description: doc.document_description || "",
    notes: doc.internal_notes || "",
    payment_due_date: (doc as any).payment_due_date || "",
  }

  // Generate HTML rows for payments table
  // This is used when template engine doesn't support {{#each}}
  // NOTE: invoiceReceipt is tax-invoice-like *and* has payments; keep payments enabled for it.
  if (isTaxInvoiceLike(doc.document_type) && !isInvoiceReceiptType(doc.document_type)) {
    templateData.PAYMENTS_ROWS_HTML = ""
    templateData.TOTAL_AMOUNT = ""
    templateData.PAYMENTS_TOTAL = ""
  } else if (mappedPayments.length > 0) {
    const paymentsTotal = mappedPayments.reduce((acc: number, p: any) => {
      const n = typeof p?.amount === "number" ? p.amount : parseFloat(p?.amount || 0)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
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
      const detailsWithMethod = payment.method
        ? `${payment.method}: ${paymentDetails}`.trim()
        : paymentDetails
      
      // Escape HTML to prevent XSS
      const escapedMethod = escapeHtml(payment.method)
      const escapedDetails = escapeHtml(detailsWithMethod)
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
    templateData.PAYMENTS_TOTAL = formatCurrency(paymentsTotal)
  } else {
    // Empty string if no payments (not null)
    templateData.PAYMENTS_ROWS_HTML = ""
    templateData.PAYMENTS_TOTAL = ""
  }
  if (isTaxInvoiceLike(doc.document_type)) {
    // ✅ יצירת שורות טבלה דינמיות - 5 תאים כשיש מק"ט, 4 תאים כשאין
    const itemRows = (items || []).map((item: any) => {
      const metadata = item.payment_metadata || {}
      const quantity = Number.isFinite(item.quantity) ? item.quantity : 0
      const lineTotal = Number(item.line_total || 0)
      const itemDate = item.item_date || doc.issue_date || ""
      const sku = item.item_sku || ""
      
      const formattedDate = formatDate(itemDate)
      const formattedTotal = formatCurrency(lineTotal)
      
      const escapedQty = escapeHtml(String(quantity))
      const escapedDetails = escapeHtml(
        metadata.details || item.description || metadata.label || ""
      )
      const escapedDate = escapeHtml(formattedDate)
      const escapedTotal = escapeHtml(formattedTotal)

      // אם יש מק"ט במסמך הזה, יוצר 5 תאים (כולל מק"ט)
      if (hasSkuData) {
        const escapedSku = escapeHtml(String(sku))
        return `<tr>
  <td>${escapedSku}</td>
  <td>${escapedQty}</td>
  <td>${escapedDetails}</td>
  <td>${escapedDate}</td>
  <td>${escapedTotal}</td>
</tr>`
      }
      
      // אם אין מק"ט במסמך, יוצר 4 תאים (בלי מק"ט)
      return `<tr>
  <td>${escapedQty}</td>
  <td>${escapedDetails}</td>
  <td>${escapedDate}</td>
  <td>${escapedTotal}</td>
</tr>`
    })
    templateData.TI_ROWS_HTML = itemRows.join("\n")
    
    // ✅ SKU_ROWS_HTML כבר לא נדרש (הוסרה הטבלה הנפרדת)
    templateData.SKU_ROWS_HTML = ""
    
    templateData.TI_SUBTOTAL = formatCurrency(doc.subtotal ? parseFloat(doc.subtotal) : 0)
    templateData.TI_VAT_RATE = doc.vat_rate ? parseFloat(doc.vat_rate) : 0
    templateData.TI_VAT_AMOUNT = formatCurrency(doc.vat_amount ? parseFloat(doc.vat_amount) : 0)
    templateData.TI_TOTAL_AMOUNT = formatCurrency(parseFloat(doc.total_amount || 0))
  } else {
    templateData.TI_ROWS_HTML = ""
    templateData.SKU_ROWS_HTML = "" // ✅ ריק עבור מסמכי קבלה רגילים
    templateData.TI_SUBTOTAL = ""
    templateData.TI_VAT_RATE = ""
    templateData.TI_VAT_AMOUNT = ""
    templateData.TI_TOTAL_AMOUNT = ""
  }
  if (process.env.NODE_ENV !== "production") {
    if (isTaxInvoiceLike(doc.document_type)) {
      console.log("[template-vars][tax_invoice]", {
        TI_ROWS_HTML_length: templateData.TI_ROWS_HTML.length,
        HAS_SKU_DATA: templateData.HAS_SKU_DATA, // ✅ האם יש מק"ט
        items_count: (items || []).length,
        TI_SUBTOTAL: templateData.TI_SUBTOTAL,
        TI_VAT_RATE: templateData.TI_VAT_RATE,
        TI_VAT_AMOUNT: templateData.TI_VAT_AMOUNT,
        TI_TOTAL_AMOUNT: templateData.TI_TOTAL_AMOUNT,
      })
    } else {
      console.log("[template-vars][receipt]", {
        PAYMENTS_ROWS_HTML: templateData.PAYMENTS_ROWS_HTML,
        TOTAL_AMOUNT: templateData.TOTAL_AMOUNT,
      })
    }
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
  options?: { 
    language?: "he" | "en"; 
    mode?: "preview" | "final" | "recovery" | "copy";
    allowEnInFinalization?: boolean; // Allow EN only in finalization context
    isIssuance?: boolean; // Explicit issuance context (allowed to generate)
    requestId?: string;
    context?: "preview" | "finalize" | "issue" | "recovery" | "download" | "view";
    variant?: "original" | "copy";
  }
): Promise<PDFGenerationResult> {
  const pdfDebugEnabled = isPdfDebugEnabled()
  if (pdfDebugEnabled) {
    console.log(`[generateDocumentPDF] Starting PDF generation for document: ${documentId}`)
  }
  const pdfStartedAt = Date.now()
  const requestId = options?.requestId || "unknown"
  
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
    if (pdfDebugEnabled) {
      console.log(`[generateDocumentPDF] Document number from DB:`, {
        documentId,
        document_number: doc?.document_number || 'NULL',
        document_number_type: typeof doc?.document_number,
        document_number_length: doc?.document_number?.length || 0,
      })
    }
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
    const context =
      options?.context ||
      (pdfMode === "final" ? "issue" : pdfMode === "copy" ? "view" : pdfMode === "preview" ? "preview" : pdfMode)
    const resolvedContext = context as PdfLogContext

    // Hard guard: preview must never use generateDocumentPDF
    if (pdfMode === "preview" || resolvedContext === "preview") {
      logPdfEvent("core", "PREVIEW_RENDERED_NO_STORAGE_WRITE", {
        docId: documentId,
        requestId,
        context: "preview",
        lang: targetLanguage,
        result: "MISSING",
        source: "generateDocumentPDF",
        timingMs: Date.now() - pdfStartedAt,
        businessId: doc.company_id,
      })
      return {
        success: false,
        error: "PREVIEW_MUST_USE_GENERATE_PREVIEW",
      }
    }

    // Regulatory: originals are Hebrew-only.
    // Allow EN only if explicitly allowed (from finalizeDocument context)
    if ((pdfMode === "final" || pdfMode === "recovery") && targetLanguage !== "he") {
      if (!options?.allowEnInFinalization) {
        return {
          success: false,
          error: "ORIGINAL_MUST_BE_HE: מסמך מקור חייב להיות בעברית. English PDF can only be created during finalization.",
        }
      }
    }

    // Regulatory UX:
    // - HE: embed label based on variant (original/copy) for regulatory marking
    // - EN: certified copy label is always embedded
    const documentCopyLabel =
      targetLanguage === "en"
        ? "Certified Copy"
        : options?.variant === "copy"
          ? "העתק נאמן למקור"
          : options?.variant === "original"
            ? "מקור"
            : ""


    // Compute storage key early (immutable storage naming rules).
    const storageKey =
      targetLanguage === "he" && options?.variant
        ? `documents/${documentId}/${options.variant}.he.pdf`
        : `documents/${documentId}/source.${targetLanguage}.pdf`
    const storageBucket = "business-assets"


    // Regulatory check: If PDF already exists, return it (immutable).
    // IMPORTANT: for `mode=copy` we must NOT reuse stored originals; copies are generated on-the-fly.
    if (pdfMode !== "copy") {
      const filename = storageKey.split("/").pop() || "source.pdf"
      const { data: fileData } = await adminClient.storage
        .from("business-assets")
        .list(`documents/${documentId}`, {
          limit: 1,
          search: filename,
        })

      if (fileData && fileData.length > 0) {
        if (pdfDebugEnabled) {
          console.log(`[generateDocumentPDF] PDF already exists for document ${documentId}, returning existing`)
        }
        logPdfEvent("core", "PDF_RETURNED_STORED", {
          docId: documentId,
          requestId,
          context: resolvedContext,
          lang: targetLanguage,
          result: "RETURNED_STORED",
          bucket: storageBucket,
          fullPath: storageKey,
          timingMs: Date.now() - pdfStartedAt,
          source: "generateDocumentPDF",
          businessId: doc.company_id,
        })
        return {
          success: true,
          path: storageKey,
          storageKey,
          buffer: undefined,
        }
      }

      const pdfExpected =
        doc.document_status === "final" ||
        doc.document_status === "pdf_ready" ||
        (!options?.language && !!doc.pdf_storage_key)

      if (pdfExpected) {
        console.error(`[generateDocumentPDF] PDF_MISSING_BUT_EXPECTED`, {
          documentId,
          documentStatus: doc.document_status,
          pdfMode,
          targetLanguage,
          storageKey,
        })
        logPdfEvent("core", "PDF_MISSING_BUT_EXPECTED", {
          docId: documentId,
          requestId,
          context: resolvedContext,
          lang: targetLanguage,
          result: "MISSING",
          bucket: storageBucket,
          fullPath: storageKey,
          timingMs: Date.now() - pdfStartedAt,
          source: "generateDocumentPDF",
          businessId: doc.company_id,
        })
        return {
          success: false,
          error: "PDF_MISSING_BUT_EXPECTED",
        }
      }

      if (!options?.isIssuance) {
        console.error(`[generateDocumentPDF] PDF_NOT_ISSUED`, {
          documentId,
          documentStatus: doc.document_status,
          pdfMode,
          targetLanguage,
          storageKey,
        })
        return {
          success: false,
          error: "PDF_NOT_ISSUED",
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
      allowFallbackToHe: false,
    })
    
    const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true'
    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] generateDocumentPDF - template loaded:", {
        templateId: template.templateId?.substring(0, 8) || 'fallback',
        hasHtml: !!template.html,
        htmlLength: template.html?.length || 0,
        hasCss: !!template.css,
        cssLength: template.css?.length || 0,
        resolvedLanguage: template.resolvedLanguage,
        pdfMode
      })
    }

    // 4. Validate template (optional - log warnings)
    const validation = validateTemplate(
      template.html,
      resolveTemplateDocumentType(doc.document_type) as any
    )
    if (!validation.valid) {
      console.warn(`Template missing required placeholders:`, validation.missing)
    }

    // 5. Render HTML from template    
    const renderedHtml = compileAndRender(template.html, templateData)

    // IMPORTANT: Do NOT inject any extra content into the HTML.
    // The template must be the only source of truth for PDF content.
    const renderedHtmlWithMark = renderedHtml
    const cssWithMark = `${template.css || ""}`
    // 6. Generate PDF using Playwright with minimal margins to prevent 2-page output
    if (pdfDebugEnabled) {
      console.log(`[generateDocumentPDF] Generating PDF buffer from HTML for document: ${documentId}`)
    }
    const footerDateTime = templateData.CURRENT_DATE_TIME || ""
    const footerTemplate = `
      <div style="font-family: Heebo, Arial, sans-serif; font-size: 10px; color: #111; width: 100%; padding: 0 8mm; box-sizing: border-box;">
<div style="border-top: 1px solid #e5e7eb; padding-top: 3mm; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;">
  <span style="justify-self: start; text-align: right;">הופק ב-${footerDateTime}</span>
  <span style="justify-self: center;">עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span>
  <span style="justify-self: end; text-align: left; direction: rtl; unicode-bidi: plaintext;">מסמך ממוחשב הופק על ידי thebarlev</span>
</div>
      </div>
    `
    const pdfResult = await generatePDFFromHTML(renderedHtmlWithMark, cssWithMark, {
      format: "A4",
      printBackground: true,
      margin: {
        top: "3mm",     // Minimal top margin to start content higher
        right: "8mm",   // Minimal side margins
        bottom: "15mm", // Space for footer template
        left: "8mm",    // Minimal side margins
      },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate,
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

    // 7. Upload PDF to Supabase Storage using admin client (bypasses RLS)
    // Use service role key to upload - this bypasses RLS policies
    if (pdfDebugEnabled) {
      console.log(
        `[generateDocumentPDF] Uploading PDF to storage for document ${documentId}, path: ${storageKey}, size: ${finalPdfBuffer.length} bytes`
      )
    }    
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
        if (pdfDebugEnabled) {
          console.log(`[generateDocumentPDF] PDF already exists in storage for document ${documentId}, returning existing storage key`)
        }
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

    if (pdfDebugEnabled) {
      console.log(`[generateDocumentPDF] PDF uploaded successfully to storage for document ${documentId}, path: ${storageKey}`)
    }

    // 9. Calculate SHA256 checksum for integrity verification
    const crypto = await import("crypto")
    const pdfSha256 = signingInfo?.signedPdfSha256 || crypto.createHash("sha256").update(finalPdfBuffer as any).digest("hex")
    logPdfEvent("core", "PDF_GENERATED_AND_UPLOADED", {
      docId: documentId,
      requestId,
      context: resolvedContext,
      lang: targetLanguage,
      result: "GENERATED_NEW",
      bucket: storageBucket,
      fullPath: storageKey,
      sizeBytes: finalPdfBuffer.length,
      sha256: pdfSha256,
      timingMs: Date.now() - pdfStartedAt,
      source: "generateDocumentPDF",
      businessId: doc.company_id,
    })

    // 10. Note: Bucket is private, so we don't use getPublicUrl
    // PDFs are accessed via signed URLs only (created in API route)
    const shouldPersistPdfStorageKey =
      (pdfMode === "final" || pdfMode === "recovery") &&
      targetLanguage === "he" &&
      options?.variant !== "copy"
    const shouldPersistCopyStorageKey =
      (pdfMode === "final" || pdfMode === "recovery") &&
      targetLanguage === "he" &&
      options?.variant === "copy"
    const shouldPersistEnStorageKey =
      (pdfMode === "final" || pdfMode === "recovery") &&
      targetLanguage === "en"

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
      if (pdfDebugEnabled) {
        console.log(`[generateDocumentPDF] Skipping pdf_storage_key DB update (alternate language PDF):`, {
          documentId,
          docLanguage: (doc as any)?.language || "he",
          requestedLanguage: options?.language,
          storageKey,
        })
      }
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

    // Persist storage key for Hebrew copy / English variants (for reporting exports).
    if (shouldPersistCopyStorageKey) {
      const { data: copyUpdated, error: copyError } = await adminClient
        .from("documents")
        .update({ pdf_storage_key_he_copy: storageKey })
        .eq("id", documentId)
        .is("pdf_storage_key_he_copy", null)
        .select("id")
    }
    if (shouldPersistEnStorageKey) {
      const { data: enUpdated, error: enError } = await adminClient
        .from("documents")
        .update({ pdf_storage_key_en: storageKey })
        .eq("id", documentId)
        .is("pdf_storage_key_en", null)
        .select("id")
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
    requestId?: string;
    context?: "preview";
  }
): Promise<PDFGenerationResult> {  
  try {
    const pdfDebugEnabled = isPdfDebugEnabled()
    if (pdfDebugEnabled) {
      console.log(`[generatePreviewPDF] Starting for document: ${documentId}`)
    }
    
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
      if (pdfDebugEnabled) {
        console.warn(`[generatePreviewPDF] Document not found: ${documentId}`, docError)
      }
      return { success: false, error: `DOCUMENT_NOT_FOUND:${documentId}` }
    }

    // Get template
    const template = await getTemplateForDocument(doc.company_id, doc.document_type as any, {
      language: targetLanguage,
      allowFallbackToHe: true,
    })
    
    const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true'
    if (DEBUG_TEMPLATES) {
      console.log("[TEMPLATE_FETCH] generatePreviewPDF - template loaded:", {
        templateId: template.templateId?.substring(0, 8) || 'fallback',
        hasHtml: !!template.html,
        htmlLength: template.html?.length || 0,
        hasCss: !!template.css,
        cssLength: template.css?.length || 0,
        resolvedLanguage: template.resolvedLanguage,
        didFallbackToHe: template.didFallbackToHe
      })
    }
    
    if (template.didFallbackToHe) {
      if (pdfDebugEnabled) {
        console.warn("[PDF PREVIEW] Template fallback to HE (missing EN variant)", {
          documentId: documentId.substring(0, 8),
          requestedLanguage: targetLanguage,
        })
      }
    }
    // Render and generate PDF (no storage)
    if (pdfDebugEnabled) {
      console.log(`[generatePreviewPDF] Rendering template for document: ${documentId}`)
    }
    const renderedHtml = compileAndRender(template.html, templateData)    
    if (pdfDebugEnabled) {
      console.log(`[generatePreviewPDF] Generating PDF from HTML`)
    }
    const pdfResult = await generatePDFFromHTML(renderedHtml, template.css, {
      format: "A4",
      printBackground: true,
    })
    if (pdfDebugEnabled) {
      console.log(`[generatePreviewPDF] PDF generated successfully`)
    }
    logPdfEvent("core", "PREVIEW_RENDERED_NO_STORAGE_WRITE", {
      docId: documentId,
      requestId: options?.requestId || "unknown",
      context: "preview",
      lang: targetLanguage,
      result: "GENERATED_NEW",
      timingMs: Date.now(),
      source: "generatePreviewPDF",
    })
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
