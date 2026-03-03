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
import { createSigningRequest, sha256Hex as sha256HexFromSigningClient } from "@/lib/documents/signing/secure-signature-client"
import { stampPdfFooter } from "@/lib/pdf/stamp-footer"
import { PUBLIC_ASSETS_BUCKET, SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { countHandlebarsBlocks, redactDigits, safeExcerptNoDigits, stripHtmlToText } from "@/lib/template-engine"
import type { 
  TemplateDefinition, 
  ReceiptTemplateData,
  PDFGenerationResult 
} from "@/lib/types/template"

import fs from "node:fs"
import pathNode from "node:path"

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

  return nextCss
}

let cachedAssistantTtfBase64: string | null = null
let cachedAssistantTtfBase64Error: string | null = null

async function loadAssistantTtfBase64(): Promise<string> {
  if (cachedAssistantTtfBase64 !== null) return cachedAssistantTtfBase64
  if (cachedAssistantTtfBase64Error) return ""
  try {
    const ttfPath = path.join(process.cwd(), "public", "AssistantRegular.ttf")
    const buf = await readFile(ttfPath)
    cachedAssistantTtfBase64 = buf.toString("base64")
    return cachedAssistantTtfBase64
  } catch (e: any) {
    cachedAssistantTtfBase64Error = e?.message || String(e)
    cachedAssistantTtfBase64 = ""
    return ""
  }
}

async function buildDeterministicFontCssPrefix(): Promise<string> {
  const ttf = await loadAssistantTtfBase64()
  if (!ttf) return ""
  // Determinism requirement: no network fonts. Provide both family names used in templates/footers.
  return `
/* __deterministic_fonts__ */
@font-face {
  font-family: 'Assistant';
  font-style: normal;
  font-weight: 400;
  src: url(data:font/ttf;base64,${ttf}) format('truetype');
}
@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-weight: 400;
  src: url(data:font/ttf;base64,${ttf}) format('truetype');
}
/* __end_deterministic_fonts__ */
`
}

async function loadTemplateById(params: {
  templateId: string
  language: "he" | "en"
}): Promise<{ html: string; css: string; templateId: string } | null> {
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from("templates")
    .select("id, html_template, css, html_en, css_en, html_he, css_he")
    .eq("id", params.templateId)
    .maybeSingle()

  if (error || !row) return null

  const pickNonEmpty = (...vals: Array<unknown>): string | null => {
    for (const v of vals) {
      if (typeof v === "string" && v.trim().length > 0) return v
    }
    return null
  }

  // Prefer bilingual fields if NON-EMPTY; otherwise fallback to legacy.
  const heHtml = pickNonEmpty((row as any).html_he, (row as any).html_template, (row as any).html)
  const heCss = pickNonEmpty((row as any).css_he, (row as any).css) || ""
  const enHtml = pickNonEmpty((row as any).html_en)
  const enCss = pickNonEmpty((row as any).css_en) || null

  if (params.language === "en") {
    if (typeof enHtml === "string" && enHtml.trim().length > 0) {
      const css = typeof enCss === "string" && enCss.trim().length > 0 ? enCss : (heCss || "")
      return { html: enHtml, css: css || "", templateId: row.id }
    }
    return null
  }

  if (typeof heHtml === "string" && heHtml.trim().length > 0) {
    return { html: heHtml, css: heCss || "", templateId: row.id }
  }
  return null
}

export async function renderDeterministicPdfBytes(params: {
  documentId: string
  language: "he" | "en"
  documentCopyLabel: string
  /**
   * If provided, render using this specific template snapshot.
   * Otherwise, will use documents.template_version_id or fall back to runtime selection.
   */
  templateVersionId?: string | null
}): Promise<
  | {
      ok: true
      pdfBytes: Buffer
      pdfSha256: string
      rawPdfBytes?: Buffer
      rawPdfSha256?: string
      frozenNowIso: string
      templateVersionId: string | null
    }
  | { ok: false; message: string }
> {
  console.log("[SIGN_FLOW] deterministic PDF render entry", {
    documentId: params.documentId,
    language: params.language,
    label: params.documentCopyLabel,
  })
  const admin = createAdminClient()
  const { data: doc, error: docError } = await admin
    .from("documents")
    .select("id, company_id, document_type, pdf_generated_at, finalized_at, template_version_id, document_number")
    .eq("id", params.documentId)
    .single()
  if (docError || !doc) return { ok: false, message: "DOCUMENT_NOT_FOUND" }

  const frozenNowIsoRaw: string | null =
    (doc as any)?.pdf_generated_at ? String((doc as any).pdf_generated_at) :
    (doc as any)?.finalized_at ? String((doc as any).finalized_at) :
    null
  if (!frozenNowIsoRaw) {
    return { ok: false, message: "FROZEN_TIMESTAMP_MISSING: pdf_generated_at/finalized_at is required for deterministic issuance" }
  }
  const frozenNowIso = frozenNowIsoRaw

  const desiredTemplateId = params.templateVersionId || (doc as any)?.template_version_id || null
  const loaded =
    desiredTemplateId ? await loadTemplateById({ templateId: desiredTemplateId, language: params.language }) : null

  const fallbackTemplate =
    !loaded
      ? await (async () => {
          const t = await getTemplateForDocument((doc as any).company_id, (doc as any).document_type as any, {
            language: params.language,
            // If EN template is missing, allow using HE template rather than failing issuance.
            // (The language-specific content is controlled by the template; this just avoids a hard stop.)
            allowFallbackToHe: params.language === "en",
          })
          return { html: t.html, css: t.css, templateId: t.templateId }
        })()
      : null

  const template = loaded || fallbackTemplate
  if (!template) return { ok: false, message: "TEMPLATE_NOT_FOUND" }

  const templateData = await prepareDocumentData(params.documentId, params.language, {
    documentCopyLabel: params.documentCopyLabel,
    frozenNowIso,
    embedAssetsAsDataUrls: true,
  })

  const renderedHtml = compileAndRender(template.html, templateData)
  // Source of truth: CSS must come from the Admin template DB only (no hardcoded/merged/augmented CSS).
  const finalCss = String(template.css || "")

  const footerDateTime = (templateData as any)?.CURRENT_DATE_TIME || ""
  // Footer HTML/CSS is not generated here. Page numbers are stamped outside HTML/CSS.
  const footerTemplate = ""

  const isRemoteRenderer =
    typeof process.env.PDF_RENDER_URL === "string" &&
    process.env.PDF_RENDER_URL.length > 0 &&
    typeof process.env.PDF_RENDER_TOKEN === "string" &&
    process.env.PDF_RENDER_TOKEN.length > 0

  // When using pdf.vow.co.il, it should act as renderer only.
  // Send the footer as-is to the renderer (no stamping / no fallback).
  const pdfMargin = isRemoteRenderer
    ? { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    : { top: "3mm", right: "8mm", bottom: "15mm", left: "8mm" }

  const pdfResult = await generatePDFFromHTML(renderedHtml, finalCss, {
    format: "A4",
    printBackground: true,
    margin: pdfMargin,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate,
    blockNetwork: true,
  })

  if (!pdfResult.success || !pdfResult.buffer) {
    return { ok: false, message: pdfResult.error || "PDF_GENERATION_FAILED" }
  }

  const rawPdfBytes = Buffer.from(pdfResult.buffer as any)
  const rawPdfSha256 = sha256HexFromSigningClient(rawPdfBytes)

  // Apply footer page numbers outside HTML/CSS (deterministic, works regardless of renderer).
  // Keep raw bytes for fallback signing if provider is sensitive.
  let pdfBytes = rawPdfBytes
  pdfBytes = await stampPdfFooter({
    pdfBytes: rawPdfBytes,
    language: params.language,
    generatedAtText: footerDateTime,
  })

  const pdfSha256 = sha256HexFromSigningClient(pdfBytes)

  console.log("[SIGN_FLOW] deterministic PDF bytes produced", {
    documentId: params.documentId,
    bytesLength: pdfBytes.length,
    sha256: pdfSha256,
    frozenNowIso,
  })
  return {
    ok: true,
    pdfBytes,
    pdfSha256,
    rawPdfBytes,
    rawPdfSha256,
    frozenNowIso,
    templateVersionId: template.templateId || null,
  }
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

const resolveTemplateDocumentTypesToTry = (documentType: string) => {
  const primary = resolveTemplateDocumentType(documentType)
  // Historical compatibility: some Admin templates were saved under invoice_receipt while
  // issuance queries tax_invoice. Treat them as the same pool.
  if (primary === "tax_invoice") return ["tax_invoice", "invoice_receipt"]
  return [primary]
}

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
  // IMPORTANT: Template resolution is server-side only and must use the canonical Admin templates.
  // Using the admin client avoids RLS visibility gaps (e.g. global templates, selections, mappings)
  // which would otherwise cause fallback to hardcoded templates/CSS.
  const supabase = createAdminClient()
  const language: "he" | "en" = options?.language || "he"
  const allowFallbackToHe = options?.allowFallbackToHe === true
  const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true'
  const templateDocumentType = resolveTemplateDocumentType(documentType)
  const templateDocumentTypesToTry = resolveTemplateDocumentTypesToTry(documentType)

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
      .in("document_type", templateDocumentTypesToTry)

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
    const pickNonEmpty = (...vals: Array<unknown>): string | null => {
      for (const v of vals) {
        if (typeof v === "string" && v.trim().length > 0) return v
      }
      return null
    }

    // Support both legacy and bilingual columns, but treat empty strings as missing.
    const heHtml = pickNonEmpty(row?.html_he, row?.html_template, row?.html)
    const heCss = pickNonEmpty(row?.css_he, row?.css) || ""
    const enHtml = pickNonEmpty(row?.html_en)
    const enCss = pickNonEmpty(row?.css_en)

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
    // Source of truth: CSS must come from the template DB only (no augmentation/merging).
    return { ...picked, css: picked.css || "", templateId }
  }

  // PRIORITY 0: User's explicit selection from settings (highest priority)
  const { data: userSelection } = await supabase
    .from("company_template_selections")
    .select("template_id")
    .eq("company_id", companyId)
    .in("document_type", templateDocumentTypesToTry)
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
      .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_he, css_he, html_en, css_en")
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

  // PRIORITY 0.5: Legacy single-selection (companies.selected_template_id)
  // Use ONLY if that template supports this document type (via junction table or legacy column).
  const { data: companyRow } = await supabase
    .from("companies")
    .select("selected_template_id")
    .eq("id", companyId)
    .maybeSingle()

  if (companyRow?.selected_template_id) {
    const legacyId = String(companyRow.selected_template_id)

    // Check support via template_document_types first
    let supportsDocType = false
    try {
      const { data: mapRow } = await supabase
        .from("template_document_types")
        .select("template_id, document_type")
        .eq("template_id", legacyId)
        .in("document_type", templateDocumentTypesToTry)
        .limit(1)
        .maybeSingle()
      supportsDocType = !!mapRow
    } catch {
      supportsDocType = false
    }

    const { data: legacyTemplate } = await supabase
      .from("templates")
      .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_he, css_he, html_en, css_en")
      .eq("id", legacyId)
      .eq("is_active", true)
      .maybeSingle()

    // Fallback check: legacy column match (deprecated but still valid)
    if (!supportsDocType && legacyTemplate) {
      supportsDocType = templateDocumentTypesToTry.includes(String((legacyTemplate as any).document_type || ""))
    }

    if (legacyTemplate && supportsDocType) {
      const picked = pickVariantChecked(legacyTemplate, "PRIORITY_0_5_LEGACY_COMPANY_SELECTED")
      if (picked) {
        return await finalizePicked(picked, legacyTemplate.id)
      }
    }
  }

  // PRIORITY 1: Company's default template
  const { data: companyDefault } = await supabase
    .from("templates")
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_he, css_he, html_en, css_en")
    .eq("company_id", companyId)
    .in("document_type", templateDocumentTypesToTry)
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
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_he, css_he, html_en, css_en")
    .is("company_id", null)
    .in("document_type", templateDocumentTypesToTry)
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
      .in("document_type", templateDocumentTypesToTry)
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
      .in("document_type", templateDocumentTypesToTry)
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
        .in("document_type", templateDocumentTypesToTry)
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
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_he, css_he, html_en, css_en")
    .eq("company_id", companyId)
    .in("document_type", templateDocumentTypesToTry)
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
    .select("id, name, company_id, document_type, is_default, is_active, html_template, css, html_he, css_he, html_en, css_en")
    .is("company_id", null)
    .in("document_type", templateDocumentTypesToTry)
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
    const classicNamePattern = "%קלאס%"

    const { data: mappedCompanyTemplate, error: mappedCompanyError } = await supabase
      .from("templates")
      // Use '*' to avoid schema drift (some DBs don't have bilingual columns)
      .select("*")
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

    // Prefer "קלאסי/קלאסית" template among mapped globals when available.
    const { data: mappedGlobalClassic, error: mappedGlobalClassicError } = await supabase
      .from("templates")
      .select("*")
      .is("company_id", null)
      .in("id", mappedTemplateIds)
      .eq("is_active", true)
      .ilike("name", classicNamePattern)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (mappedGlobalClassic) {
      console.log(`⚠️ Using mapped global classic template: ${mappedGlobalClassic.name} (${mappedGlobalClassic.id})`)
      const picked = pickVariantChecked(mappedGlobalClassic, "PRIORITY_4_5_MAPPED_GLOBAL_CLASSIC")
      if (picked) {
        return await finalizePicked(picked, mappedGlobalClassic.id)
      }
    }

    const { data: mappedGlobalTemplate, error: mappedGlobalError } = await supabase
      .from("templates")
      // Use '*' to avoid schema drift (some DBs don't have bilingual columns)
      .select("*")
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

  // No hardcoded fallback: Admin Templates are the source of truth.
  // If we reach here, the dataset has no matching active template.
  throw new Error("TEMPLATE_NOT_FOUND")
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
    /**
     * Deterministic timestamp (ISO) to use for any “now” placeholders in PDFs.
     * If provided, CURRENT_DATE_TIME/TIME are derived from this value.
     */
    frozenNowIso?: string;
    /**
     * If true, embed logo/signature as data: URLs (no signed/public URLs).
     * Required for deterministic issuance (no network).
     */
    embedAssetsAsDataUrls?: boolean;
  }
): Promise<ReceiptTemplateData> {
  // Use service-role for PDF data assembly to avoid tenant RLS hiding issuer-company
  // relations on cross-tenant billing documents (issuer VOW, viewer buyer company).
  const supabase = createAdminClient()
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

  // For auto-issued billing documents, customer details may live on buyer company
  // (billing_documents.buyer_company_id) and not in customers table.
  let buyerCompany: any = null
  if (!(doc as any)?.customer) {
    try {
      const { data: bd } = await supabase
        .from("billing_documents")
        .select("buyer_company_id")
        .eq("document_id", documentId)
        .maybeSingle()

      const buyerCompanyId = String((bd as any)?.buyer_company_id || "").trim()
      if (buyerCompanyId) {
        const { data: bc } = await supabase
          .from("companies")
          .select("id, company_name, registration_number, company_number, address, street, city, postal_code, phone, mobile_phone, email, website")
          .eq("id", buyerCompanyId)
          .maybeSingle()
        buyerCompany = bc || null
      }
    } catch {
      buyerCompany = null
    }
  }

  // Fetch line items (these contain the payments)
  const { data: items, error: itemsError } = await supabase
    .from("document_line_items")
    .select("*")
    .eq("document_id", documentId)
    .order("line_number", { ascending: true })
  const hasKindDiscriminator = (items || []).some((it: any) => {
    const k = (it?.payment_metadata as any)?.kind
    return typeof k === "string" && k.trim().length > 0
  })
  const paymentItems = hasKindDiscriminator
    ? (items || []).filter((it: any) => String((it?.payment_metadata as any)?.kind || "") === "payment")
    : (items || [])
  const docItems = hasKindDiscriminator
    ? (items || []).filter((it: any) => String((it?.payment_metadata as any)?.kind || "") !== "payment")
    : (items || [])
  // CRITICAL FIX: Payments are stored in document_line_items, not in doc.payment_metadata
  // Map line items to payments array
  const payments = paymentItems.map((item: any) => {
    const metadata = item.payment_metadata || {}
    if (isTaxInvoiceLike(doc.document_type)) {
      const rawBrand = metadata.cardType || metadata.cardBrand || metadata.brand || null
      const rawDealType = metadata.cardDealType || metadata.dealType || metadata.card_deal_type || null
      const rawInstallments = metadata.cardInstallments || metadata.installments || null
      const normalizedBrand = normalizeCardBrand(rawBrand)
      const normalizedDealType = normalizeCardDealType(rawDealType)
      const normalizedInstallments =
        rawInstallments != null && Number.isFinite(Number(rawInstallments))
          ? Math.max(1, Number(rawInstallments))
          : normalizedBrand || normalizedDealType
            ? 1
            : null
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
        card_last4: metadata.cardLastDigits || metadata.cardLast4 || metadata.card_num_end || null,
        transaction_id: metadata.transactionReference || metadata.transaction_id || null,
        payerAccount: null,
        cardInstallments: normalizedInstallments,
        cardDealType: normalizedDealType || (normalizedBrand ? "regular" : null),
        cardType: normalizedBrand,
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

  function normalizeCardBrand(raw: any): string | null {
    const s = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : ""
    if (!s) return null
    const n = s.toLowerCase()
    const map: Record<string, string> = {
      "1": "Visa",
      "2": "Mastercard",
      "3": "American Express",
      "4": "Diners",
      "5": "Isracard",
      "6": "JCB",
      visa: "Visa",
      mastercard: "Mastercard",
      master: "Mastercard",
      amex: "American Express",
      "american express": "American Express",
      diners: "Diners",
      isracard: "Isracard",
      jcb: "JCB",
    }
    return map[n] || s
  }

  function normalizeCardDealType(raw: any): "regular" | "payments" | "credit" | "deferred" | null {
    const s = typeof raw === "string" || typeof raw === "number" ? String(raw).trim().toLowerCase() : ""
    if (!s) return null
    if (["regular", "regil", "רגיל", "0", "1"].includes(s)) return "regular"
    if (["payments", "installments", "תשלומים", "2"].includes(s)) return "payments"
    if (["credit", "אשראי", "3"].includes(s)) return "credit"
    if (["deferred", "דחוי", "4"].includes(s)) return "deferred"
    return null
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
    if (p.card_last4 || p.cardType || p.cardDealType || p.cardInstallments) {
      const cardParts: string[] = [`*${p.card_last4}`]
      if (!p.card_last4) cardParts.length = 0
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
      const joinedCard = cardParts.join(", ").trim()
      if (joinedCard) parts.push(joinedCard)
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

    const normalizedCardBrand = normalizeCardBrand(p.cardType)
    const normalizedCardDealType = normalizeCardDealType(p.cardDealType)
    const normalizedInstallments =
      p.cardInstallments != null && Number.isFinite(Number(p.cardInstallments))
        ? Math.max(1, Number(p.cardInstallments))
        : normalizedCardBrand || normalizedCardDealType
          ? 1
          : null
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
      cardInstallments: normalizedInstallments,
      cardDealType: normalizedCardDealType || (normalizedCardBrand ? "regular" : null),
      cardType: normalizedCardBrand,
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
  if (!customerAddress && buyerCompany) {
    if ((buyerCompany as any)?.street || (buyerCompany as any)?.city) {
      const buyerAddressParts: string[] = []
      if ((buyerCompany as any)?.street) buyerAddressParts.push(String((buyerCompany as any).street))
      if ((buyerCompany as any)?.city) buyerAddressParts.push(String((buyerCompany as any).city))
      if ((buyerCompany as any)?.postal_code) buyerAddressParts.push(String((buyerCompany as any).postal_code))
      if (buyerAddressParts.length > 0) {
        customerAddress = buyerAddressParts.join(", ")
      }
    }
    if (!customerAddress && (buyerCompany as any)?.address) {
      customerAddress = String((buyerCompany as any).address)
    }
  }
  
  // Use mobile or phone for customer phone
  const customerPhone =
    doc.customer?.mobile ||
    doc.customer?.phone ||
    (doc as any)?.customer_phone ||
    (buyerCompany as any)?.mobile_phone ||
    (buyerCompany as any)?.phone ||
    null;

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

  // Best-effort: if a legacy signature exists in the public bucket, copy it into the private bucket
  // so future renders use private storage only.
  const ensureSignatureInSecureBucket = async (storagePath: string): Promise<void> => {
    if (!storagePath.startsWith("business-signatures/")) return

    // 1) Try secure bucket first (exists => done)
    const secureProbe = await adminClient.storage.from(SECURE_ASSETS_BUCKET).download(storagePath)
    if (!secureProbe.error && secureProbe.data) return

    // 2) Try legacy public bucket
    const legacy = await adminClient.storage.from(PUBLIC_ASSETS_BUCKET).download(storagePath)
    if (legacy.error || !legacy.data) return

    try {
      const ab = await (legacy.data as any).arrayBuffer()
      const buf = Buffer.from(ab)
      const ext = storagePath.split(".").pop()?.toLowerCase() || "png"
      const contentType =
        ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"

      const up = await adminClient.storage
        .from(SECURE_ASSETS_BUCKET)
        .upload(storagePath, buf, { contentType, upsert: false })

      // Ignore duplicates (immutable-ish)
      if (up.error) {
        const msg = String(up.error.message || "").toLowerCase()
        if (!msg.includes("already exists") && !msg.includes("duplicate")) return
      }
    } catch {
      // ignore best-effort migration failures
    }
  }

  // Process logo URL
  if (doc.company?.logo_url) {
    const storagePath = getStoragePathFromUrl(doc.company.logo_url)
    if (storagePath) {
      if (options?.embedAssetsAsDataUrls) {
        try {
          const { data: blob, error } = await adminClient.storage
            .from(PUBLIC_ASSETS_BUCKET)
            .download(storagePath)
          if (!error && blob) {
            const ab = await (blob as any).arrayBuffer()
            const buf = Buffer.from(ab)
            const ext = storagePath.split(".").pop()?.toLowerCase() || "png"
            const mime =
              ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"
            logoUrl = `data:${mime};base64,${buf.toString("base64")}`
          }
        } catch {
          // keep null
        }
      } else {
        // Try to create signed URL (works for private buckets)
        try {
          const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
            .from(PUBLIC_ASSETS_BUCKET)
            .createSignedUrl(storagePath, 3600) // 1 hour expiry
          
          if (!signedUrlError && signedUrlData?.signedUrl) {
            logoUrl = signedUrlData.signedUrl
            console.log(`[prepareDocumentData] Created signed URL for logo: ${storagePath}`)
          } else {
            // If signed URL fails, try public URL (bucket might be public)
            const { data: publicUrlData } = adminClient.storage
              .from(PUBLIC_ASSETS_BUCKET)
              .getPublicUrl(storagePath)
            logoUrl = publicUrlData.publicUrl || doc.company.logo_url
            console.log(`[prepareDocumentData] Using public URL for logo: ${publicUrlData.publicUrl || doc.company.logo_url}`)
          }
        } catch (error) {
          // Fallback to original URL
          logoUrl = doc.company.logo_url
          console.warn(`[prepareDocumentData] Failed to create signed URL for logo, using original:`, error)
        }
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
      await ensureSignatureInSecureBucket(storagePath)
      if (options?.embedAssetsAsDataUrls) {
        try {
          const { data: blob, error } = await adminClient.storage
            .from(SECURE_ASSETS_BUCKET)
            .download(storagePath)
          if (!error && blob) {
            const ab = await (blob as any).arrayBuffer()
            const buf = Buffer.from(ab)
            const ext = storagePath.split(".").pop()?.toLowerCase() || "png"
            const mime =
              ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"
            signatureUrl = `data:${mime};base64,${buf.toString("base64")}`
          }
        } catch {
          // keep null
        }
      } else {
        // Try to create signed URL (works for private buckets)
        try {
          const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
            .from(SECURE_ASSETS_BUCKET)
            .createSignedUrl(storagePath, 3600) // 1 hour expiry
          
          if (!signedUrlError && signedUrlData?.signedUrl) {
            signatureUrl = signedUrlData.signedUrl
            console.log(`[prepareDocumentData] Created signed URL for signature: ${storagePath}`)
          } else {
            // If signed URL fails, keep original (could be an external URL).
            const { data: publicUrlData } = adminClient.storage
              .from(SECURE_ASSETS_BUCKET)
              .getPublicUrl(storagePath)
            signatureUrl = publicUrlData.publicUrl || doc.company.signature_url
          }
        } catch (error) {
          // Fallback to original URL
          signatureUrl = doc.company.signature_url
          console.warn(`[prepareDocumentData] Failed to create signed URL for signature, using original:`, error)
        }
      }
    } else {
      // If we can't extract storage path, use original URL (might be external URL)
      signatureUrl = doc.company.signature_url
    }
  }

  // Build template data structure  
  const resolvedCustomerName =
    doc.customer?.name ||
    doc.customer_name ||
    String((buyerCompany as any)?.company_name || "").trim() ||
    ""
  const resolvedCustomerTaxId =
    doc.customer?.tax_id ||
    (doc as any)?.customer_tax_id ||
    (buyerCompany as any)?.registration_number ||
    (buyerCompany as any)?.company_number ||
    ""
  const resolvedCustomerEmail =
    doc.customer?.email ||
    (doc as any)?.customer_email ||
    (buyerCompany as any)?.email ||
    null
  const resolvedCustomerWebsite =
    (buyerCompany as any)?.website || null
  
  // Check if any item has SKU data (non-empty sku field)
  const hasSkuData = (docItems || []).some((item: any) => {
    const sku = item.item_sku || null
    return sku && String(sku).trim().length > 0
  })

  const allocationNumberRaw = (doc as any)?.allocation_number
  const allocation_number =
    allocationNumberRaw === null || allocationNumberRaw === undefined ? null : String(allocationNumberRaw).trim() || null
  
  const templateData: ReceiptTemplateData & Record<string, any> = {
    t,
    DOCUMENT_COPY_LABEL: options?.documentCopyLabel ?? "",
    HAS_SKU_DATA: hasSkuData, // ✅ משתנה חדש - האם יש מק"ט בשורות
    allocation_number,
    HAS_ALLOCATION_NUMBER: !!allocation_number,
    company: {
      name: companyNameLocalized, // Required by template validation {{company.name}}
      company_name: companyNameLocalized,
      company_name_he: companyNameHe,
      company_name_en: companyNameEn,
      contact_first_name: issuerFirstNameLocalized,
      contact_first_name_he: issuerFirstNameHe,
      contact_first_name_en: issuerFirstNameEn,
      company_tax_id: companyTaxId,
      tax_id: companyTaxId, // Alias for {{company.tax_id}}
      address: companyAddress || null, // For {{company.address}}
      company_address: companyAddress || null,
      company_phone: companyPhone,
      company_email: doc.company?.email || null,
      company_logo: logoUrl || null, // Use signed URL if available, null if no logo
      logo_url: logoUrl || null, // Required by template validation {{company.logo_url}}
    } as any,
    customer: doc.customer ? {
      name: resolvedCustomerName, // Required by template validation {{customer.name}}
      customer_name: resolvedCustomerName,
      customer_tax_id: resolvedCustomerTaxId || null,
      customer_email: resolvedCustomerEmail || null,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      address: customerAddress || null, // For {{customer.address}}
      customer_website: resolvedCustomerWebsite || null,
      email: resolvedCustomerEmail || null, // For {{customer.email}}
    } : {
      name: resolvedCustomerName,
      customer_name: resolvedCustomerName,
      customer_tax_id: resolvedCustomerTaxId || null,
      customer_email: resolvedCustomerEmail || null,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      address: customerAddress || null,
      customer_website: resolvedCustomerWebsite || null,
      email: resolvedCustomerEmail || null,
    },
    document: {
      number: doc.document_number || "", // Required by template validation {{document.number}}
      issue_date: doc.issue_date || "", // Required by template validation {{document.issue_date}}
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
    CURRENT_DATE_TIME: (() => {
      const iso = options?.frozenNowIso || null
      const d = iso ? new Date(iso) : new Date()
      const locale = documentLanguage === "en" ? "en-US" : "he-IL"
      return new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d)
    })(),
    
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
    BUSINESSID: resolvedCustomerTaxId || "",
    CLIENTPHONE: customerPhone || "",
    CLIENTADDRESS: customerAddress || "",
    CLIENTEMAIL: resolvedCustomerEmail || "",
    CLIENTDOMAIN: resolvedCustomerWebsite || "",
    
    // Document legacy placeholders
    RECEIPTNUMBER: doc.document_number || "",
    RECEIPTNNUMBER: doc.document_number || "", // Typo variant
    Datecreation: formatDate(doc.issue_date),
    DATE: formatDate(doc.issue_date),
    TIME: (() => {
      const iso = options?.frozenNowIso || null
      const d = iso ? new Date(iso) : new Date()
      const locale = documentLanguage === "en" ? "en-US" : "he-IL"
      return new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Jerusalem",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d)
    })(),
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
    customer_tax_id: resolvedCustomerTaxId || "",
    customer_phone: customerPhone || "",
    customer_address: customerAddress || "",
    customer_email: resolvedCustomerEmail || "",
    customer_website: resolvedCustomerWebsite || "",
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
    templateData.PAYMENTS_TOTAL = formatCurrency(paymentsTotal)
  } else {
    // Empty string if no payments (not null)
    templateData.PAYMENTS_ROWS_HTML = ""
    templateData.PAYMENTS_TOTAL = ""
  }
  if (isTaxInvoiceLike(doc.document_type)) {
    // ✅ יצירת שורות טבלה דינמיות - 5 תאים כשיש מק"ט, 4 תאים כשאין
    const itemRows = (docItems || []).map((item: any) => {
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
    /**
     * Force a specific template snapshot (templates.id).
     * If not provided, will use documents.template_version_id when present.
     */
    templateVersionId?: string | null;
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
      .select("id, document_type, document_status, company_id, document_number, pdf_storage_key, language, template_version_id, pdf_generated_at, finalized_at")
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

    // UX requirement:
    // In-app viewing (download/view/copy) should use a "computer-only" mark,
    // while still keeping "original/certified copy" labels for issuance contexts.
    const isComputerOnlyCopy = options?.variant === "copy" && (context === "download" || context === "view")
    const documentCopyLabel =
      targetLanguage === "en"
        ? isComputerOnlyCopy
          ? "For computer use only"
          : "Certified Copy"
        : options?.variant === "copy"
          ? isComputerOnlyCopy
            ? "להמחשה בלבד"
            : "העתק נאמן למקור"
          : options?.variant === "original"
            ? "מקור"
            : ""


    // Compute storage key early (immutable storage naming rules).
    const storageKey =
      targetLanguage === "he" && options?.variant
        ? `documents/${documentId}/${options.variant}.he.pdf`
        : `documents/${documentId}/source.${targetLanguage}.pdf`
    // MUST be private to prevent public access to accounting PDFs.
    const storageBucket = SECURE_ASSETS_BUCKET


    // Regulatory check: If PDF already exists, return it (immutable).
    // IMPORTANT: for `mode=copy` we must NOT reuse stored originals; copies are generated on-the-fly.
    if (pdfMode !== "copy") {
      const filename = storageKey.split("/").pop() || "source.pdf"
      const { data: fileData } = await adminClient.storage
        .from(storageBucket)
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

      // Recovery mode: if storage is missing but PDF is "expected", we still want to regenerate it.
      // This is needed for auto-issued documents that were finalized without generating/uploading PDFs.
      const allowRecoveryRegenerate = pdfMode === "recovery" && options?.isIssuance === true

      if (pdfExpected && !allowRecoveryRegenerate) {
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

    const frozenNowIsoRaw: string | null =
      (doc as any)?.pdf_generated_at ? String((doc as any).pdf_generated_at) :
      (doc as any)?.finalized_at ? String((doc as any).finalized_at) :
      null

    const desiredTemplateId =
      (options as any)?.templateVersionId ||
      ((doc as any)?.template_version_id ? String((doc as any).template_version_id) : null) ||
      null

    const loadedTemplate =
      desiredTemplateId ? await loadTemplateById({ templateId: desiredTemplateId, language: targetLanguage }) : null

    // 2. Prepare document data for template
    const templateData = await prepareDocumentData(documentId, targetLanguage, {
      documentCopyLabel,
      ...(frozenNowIsoRaw ? { frozenNowIso: frozenNowIsoRaw } : {}),
      // For copy/download/view: embed assets so the remote renderer doesn't depend on public URLs.
      ...(pdfMode === "copy" ? { embedAssetsAsDataUrls: true } : {}),
    })

    // 3. Get appropriate template
    const template = loadedTemplate
      ? { html: loadedTemplate.html, css: loadedTemplate.css, templateId: loadedTemplate.templateId, resolvedLanguage: targetLanguage, didFallbackToHe: false }
      : await getTemplateForDocument(doc.company_id, doc.document_type as any, {
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

    // 5. Render HTML from template.
    // Some broken admin templates can "compile" after our best-effort repair but still render EMPTY output
    // (e.g., missing {{/if}} wraps the whole document in a falsy conditional). That results in a blank PDF
    // with only a stamped footer. We detect that and fallback.
    const renderAndValidate = (html: string) => {
      const out = compileAndRender(html, templateData)
      const textLen = String(out || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim().length
      if (textLen < 40) {
        throw new Error(`TEMPLATE_RENDERED_EMPTY:textLen=${textLen}`)
      }
      return out
    }

    let renderedHtml = ""
    try {
      renderedHtml = renderAndValidate(template.html)
    } catch (e: any) {
      const msg = String(e?.message || e)

      // First fallback: resolved template selection (admin)
      try {
        const fallback = await getTemplateForDocument(doc.company_id, doc.document_type as any, {
          language: targetLanguage,
          allowFallbackToHe: false,
        })
        renderedHtml = renderAndValidate(fallback.html)
      } catch (e2: any) {
        // Last resort: built-in template
        const builtIn = getDefaultGenericDocumentTemplate()
        renderedHtml = renderAndValidate(builtIn.html)
      }
    }

    // IMPORTANT: Do NOT inject any extra content into the HTML.
    // The template must be the only source of truth for PDF content.
    const renderedHtmlWithMark = renderedHtml
    const cssWithMark = `${template.css || ""}`
    // 6. Generate PDF using Playwright with minimal margins to prevent 2-page output
    if (pdfDebugEnabled) {
      console.log(`[generateDocumentPDF] Generating PDF buffer from HTML for document: ${documentId}`)
    }
    const footerDateTime = templateData.CURRENT_DATE_TIME || ""
    // IMPORTANT: Do NOT rely on renderer header/footer support.
    // We stamp a deterministic footer (page numbers + secure badge) using `stampPdfFooter` below.
    const footerTemplate = ""
    const pdfResult = await generatePDFFromHTML(renderedHtmlWithMark, cssWithMark, {
      format: "A4",
      printBackground: true,
      margin: {
        top: "3mm",     // Minimal top margin to start content higher
        right: "8mm",   // Minimal side margins
        bottom: "15mm", // Space for stamped footer
        left: "8mm",    // Minimal side margins
      },
      displayHeaderFooter: false,
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

    // Stamp footer (page numbers + signature badge) so PDFs match across renderers.
    finalPdfBuffer = await stampPdfFooter({
      pdfBytes: finalPdfBuffer,
      language: targetLanguage,
      generatedAtText: footerDateTime,
    })

    const signingMode = pdfMode
    const shouldSignPdf =
      isDigitalSignaturesEnabled() &&
      (signingMode === "final" ||
        signingMode === "recovery" ||
        // Sign on-the-fly "copy" PDFs served to users (same layout as download).
        (signingMode === "copy" && options?.variant === "copy" && (context === "download" || context === "view")))
    const signingInfo = shouldSignPdf
      ? await (async () => {
          // Prefer the Secure Signature service when configured; fallback to env P12 when available.
          const hasSecureSignatureEnv = !!(
            process.env.SECURE_SIGNATURE_BASE_URL?.trim() && process.env.SECURE_SIGNATURE_API_KEY?.trim()
          )
          const hasP12Env = !!(
            process.env.SIGNING_P12_BASE64?.trim() && process.env.SIGNING_P12_PASSWORD?.trim()
          )
          let secureSigningSucceeded = false

          if (hasSecureSignatureEnv) {
            try {
              const businessId = String((doc as any)?.company_id || "")
              const externalDocId = `${documentId}:${storageKey}`
              const businessName =
                String((templateData as any)?.USERCOMPANYNAME || (templateData as any)?.company_name || "").trim() ||
                "Business"
              const businessTaxIdRaw =
                (templateData as any)?.USERID || (templateData as any)?.company_tax_id || null
              const businessTaxId = businessTaxIdRaw ? String(businessTaxIdRaw) : null

              const r = await createSigningRequest({
                businessId,
                externalDocId,
                supplierName: "VOW",
                businessName,
                businessTaxId,
                metadata: {
                  document_id: documentId,
                  storage_key: storageKey,
                  document_number: (doc as any)?.document_number || null,
                  document_type: (doc as any)?.document_type || null,
                  language: targetLanguage,
                },
                pdfBytes: finalPdfBuffer,
              })

              if (r.ok) {
                secureSigningSucceeded = true
                return {
                  signedPdf: r.signedPdfBytes,
                  signedPdfSha256: r.signedPdfSha256,
                  certFingerprintSha256:
                    typeof (r.certInfo as any)?.fingerprint_sha256 === "string"
                      ? String((r.certInfo as any).fingerprint_sha256)
                      : typeof (r.certInfo as any)?.fingerprint === "string"
                        ? String((r.certInfo as any).fingerprint)
                        : "",
                }
              }

            } catch (e: any) {
            }
          }

          // Fallback to env P12 signer only when configured.
          if (hasP12Env) {
            return signPdfWithEnvP12(finalPdfBuffer)
          }

          // Local/dev resilience: don't block PDF generation when secure-signature
          // is temporarily unavailable and no local P12 fallback exists.
          if (process.env.NODE_ENV !== "production" && hasSecureSignatureEnv && !secureSigningSucceeded) {
            return null
          }

          throw new Error("SIGNING_UNAVAILABLE: secure signature failed and P12 fallback is not configured")
        })()
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
      .from(storageBucket)
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

// ==================== PDF DEBUG PIPELINE ====================

type TemplateSource = "snapshot" | "resolved_admin" | "built_in"

function listTopLevelKeys(obj: any): string[] {
  if (!obj || typeof obj !== "object") return []
  return Object.keys(obj)
}

function pickTemplateCandidate(params: {
  snapshot: { html: string; css: string; templateId: string } | null
  resolved: { html: string; css: string; templateId: string | null } | null
  builtIn: { html: string; css: string } | null
}): { source: TemplateSource; id: string | null; html: string; css: string } {
  if (params.snapshot) return { source: "snapshot", id: params.snapshot.templateId, html: params.snapshot.html, css: params.snapshot.css }
  if (params.resolved) return { source: "resolved_admin", id: params.resolved.templateId, html: params.resolved.html, css: params.resolved.css }
  return { source: "built_in", id: null, html: params.builtIn?.html || "", css: params.builtIn?.css || "" }
}

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

export async function getPdfDebugInfo(params: {
  documentId: string
  language: "he" | "en"
  issue: "original" | "copy"
  templateVersionId?: string | null
  minTextLength?: number
}) {
  const minTextLength = typeof params.minTextLength === "number" ? params.minTextLength : 50
  const admin = createAdminClient()
  const { data: doc } = await admin
    .from("documents")
    .select("id, company_id, document_type, template_version_id, pdf_generated_at, finalized_at, document_number, document_status")
    .eq("id", params.documentId)
    .maybeSingle()

  const templateId = params.templateVersionId || (doc as any)?.template_version_id || null
  const snapshot = templateId ? await loadTemplateById({ templateId: String(templateId), language: params.language }) : null
  const resolved = await getTemplateForDocument(String((doc as any)?.company_id || ""), ((doc as any)?.document_type || "receipt") as any, {
    language: params.language,
    allowFallbackToHe: false,
  })
  const builtIn = getDefaultGenericDocumentTemplate()

  const chosen = pickTemplateCandidate({
    snapshot,
    resolved: { html: resolved.html, css: resolved.css, templateId: resolved.templateId },
    builtIn,
  })

  const frozenNowIsoRaw: string | null =
    (doc as any)?.pdf_generated_at ? String((doc as any).pdf_generated_at) :
    (doc as any)?.finalized_at ? String((doc as any).finalized_at) :
    null

  const templateData = await prepareDocumentData(params.documentId, params.language, {
    documentCopyLabel: "DEBUG",
    ...(frozenNowIsoRaw ? { frozenNowIso: frozenNowIsoRaw } : {}),
    embedAssetsAsDataUrls: true,
  })

  const before = countHandlebarsBlocks(chosen.html)

  let renderedHtml = ""
  let parseError: string | null = null
  try {
    renderedHtml = compileAndRender(chosen.html, templateData)
  } catch (e: any) {
    parseError = String(e?.message || e)
    renderedHtml = ""
  }

  const after = countHandlebarsBlocks(chosen.html) // compileAndRender does normalization internally; counters here are "raw" only
  const renderedText = stripHtmlToText(renderedHtml)
  const renderedTextNoDigits = redactDigits(renderedText)

  const renderedTextLen = renderedTextNoDigits.length
  const excerpt = safeExcerptNoDigits(renderedTextNoDigits, 400)

  const finalHtmlForRenderer = packageHtmlWithCss(renderedHtml, chosen.css)

  return {
    template_source: chosen.source,
    template_id: chosen.id,
    template_snapshot_id: snapshot?.templateId || null,
    template_resolved_id: resolved.templateId || null,
    counters: {
      before,
      after,
    },
    rendered_html_length: renderedHtml.length,
    rendered_text_length: renderedTextLen,
    first_400_chars_of_rendered_text: excerpt,
    template_data: {
      top_level_keys_count: listTopLevelKeys(templateData).length,
      top_level_keys_sample: listTopLevelKeys(templateData).slice(0, 25),
    },
    parse_error: parseError,
    min_text_length: minTextLength,
    final_html_for_renderer: finalHtmlForRenderer,
    final_css_for_renderer: String(chosen.css || ""),
  }
}

export async function renderRemotePdfWithMeta(args: {
  html: string
  css: string
  footer_html: string
  footer_css: string
  options?: any
  artifactLabel: string
  templateSource: string
  htmlCharLen: number
  htmlTextLen: number
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.PDF_RENDER_TIMEOUT_MS || 45000))
  const url = `${process.env.PDF_RENDER_URL}/render`
  const baseHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.PDF_RENDER_TOKEN}`,
  }

  const payload = {
    html: args.html,
    css: args.css,
    footer_html: args.footer_html,
    footer_css: args.footer_css,
    options: args.options || {},
  }

  const body = JSON.stringify(payload)
  const t0 = Date.now()
  let status = 0
  let ok = false
  let headers: Record<string, string> = {}
  let pdfBytesLen: number | null = null

  try {
    const res = await fetch(url, { method: "POST", headers: baseHeaders, body, signal: controller.signal })
    status = res.status
    ok = res.ok
    res.headers.forEach((v, k) => {
      headers[k] = v
    })
    const buf = Buffer.from(await res.arrayBuffer())
    pdfBytesLen = buf.length

    // Write artifact (metadata only; no HTML/CSS, no PII).
    const dir = pathNode.join(process.cwd(), ".cursor", "pdf-render-artifacts")
    try {
      fs.mkdirSync(dir, { recursive: true })
      const artifactPath = pathNode.join(dir, `${Date.now()}-${args.artifactLabel}.json`)
      fs.writeFileSync(
        artifactPath,
        JSON.stringify(
          {
            ts: Date.now(),
            renderer_status: status,
            renderer_ok: ok,
            renderer_headers: headers,
            renderer_pdf_bytes: pdfBytesLen,
            html_char_len: args.htmlCharLen,
            html_text_len: args.htmlTextLen,
            template_source: args.templateSource,
            duration_ms: Date.now() - t0,
          },
          null,
          2
        )
      )
    } catch {
      // ignore artifact write failures
    }

    // Single structured log line (no PII)
    console.log("[PDF_RENDER_CAPTURE]", {
      renderer_status: status,
      renderer_ok: ok,
      renderer_pdf_bytes: pdfBytesLen,
      html_char_len: args.htmlCharLen,
      html_text_len: args.htmlTextLen,
      template_source: args.templateSource,
      duration_ms: Date.now() - t0,
    })

    return {
      renderer_status: status,
      renderer_ok: ok,
      renderer_headers: headers,
      renderer_pdf_bytes: pdfBytesLen,
      duration_ms: Date.now() - t0,
    }
  } finally {
    clearTimeout(timeout)
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
    // Prepare document data (preview is always DRAFT)
    const draftLabel = targetLanguage === "en" ? "DRAFT" : "טיוטה"
    const templateData = await prepareDocumentData(documentId, targetLanguage, { documentCopyLabel: draftLabel })
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
    const watermarkCss = `
      /* __draft_watermark__ */
      body::before {
        content: "${draftLabel}";
        position: fixed;
        top: 40%;
        left: 10%;
        transform: rotate(-25deg);
        font-family: Heebo, Assistant, Arial, sans-serif;
        font-size: 120px;
        font-weight: 700;
        color: rgba(0, 0, 0, 0.12);
        z-index: 999999;
        pointer-events: none;
        white-space: nowrap;
      }
      /* __end_draft_watermark__ */
    `
    const fontsCss = await buildDeterministicFontCssPrefix()
    const previewCss = `${fontsCss}\n${template.css || ""}\n${watermarkCss}`

    const pdfResult = await generatePDFFromHTML(renderedHtml, previewCss, {
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
