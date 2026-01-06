"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReceiptStyleSettings } from "@/lib/types/receipt-style";

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("he-IL");
  } catch {
    return dateStr;
  }
}

type CustomerData = {
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address_street?: string;
  address_city?: string;
  address_zip?: string;
  tax_exempt?: boolean;
  tax_id?: string;
} | null;

type CompanyData = {
  company_name: string;
  business_type?: string;
  registration_number?: string;
  address?: string;
  phone?: string;
  mobile_phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  signature_url?: string;
} | null;

export default function PreviewClient({
  customerData,
  companyData,
  styleSettings,
  templateHtml,
  templateCss,
}: {
  customerData: CustomerData;
  companyData: CompanyData;
  styleSettings: ReceiptStyleSettings;
  templateHtml: string | null;
  templateCss: string | null;
}) {
  const searchParams = useSearchParams();
  
  // State to track if component is mounted (client-side only)
  const [isMounted, setIsMounted] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  
  console.log("🔵 [PreviewClient] Rendering with template:", {
    hasTemplate: !!templateHtml,
    templateLength: templateHtml?.length || 0,
    hasCss: !!templateCss,
    cssLength: templateCss?.length || 0,
    isMounted
  });

  // Parse data from URL parameters
  const previewNumber = searchParams.get("previewNumber") || null;
  const companyName =
    companyData?.company_name ||
    searchParams.get("companyName") ||
    "העסק שלי";
  const customerName =
    customerData?.name || searchParams.get("customerName") || "";
  const documentDate = searchParams.get("documentDate") || "";
  const description = searchParams.get("description") || "";
  const notes = searchParams.get("notes") || "";
  const footerNotes = searchParams.get("footerNotes") || "";
  const total = parseFloat(searchParams.get("total") || "0");
  const currency = searchParams.get("currency") || "₪";
  const autoDownload = searchParams.get("autoDownload") === "true";

  const customerPhone = customerData?.phone || customerData?.mobile || "";
  const companyPhone = companyData?.mobile_phone || companyData?.phone || "";

  // Parse payments JSON
  let payments: Array<{
    method: string;
    date: string;
    amount: number;
    currency: string;
    bankName?: string;
    branch?: string;
    accountNumber?: string;
  }> = [];
  try {
    const paymentsStr = searchParams.get("payments");
    if (paymentsStr) {
      payments = JSON.parse(paymentsStr);
    }
  } catch (e) {
    console.error("Failed to parse payments:", e);
  }
  
  // Enable print-friendly styling on mount
  useEffect(() => {
    document.title = `קבלה${previewNumber ? ` - ${previewNumber}` : ""} - ${companyName}`;
    setIsMounted(true); // Mark as mounted after first render
    
    // Listen for iframe resize messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'resize' && event.data.height) {
        const iframe = document.getElementById('receipt-pdf-root') as HTMLIFrameElement;
        if (iframe) {
          iframe.style.height = `${event.data.height}px`;
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [previewNumber, companyName]);
  
  // Prepare template data for rendering
  const templateData = {
    // Document metadata
    previewNumber: previewNumber || "",
    documentDate: formatDate(documentDate),
    description: description || "",
    notes: notes || "",
    footerNotes: footerNotes || "",
    total: total,
    currency: currency,
    formattedTotal: formatMoney(total, currency),
    
    // Company data
    companyName: companyName,
    companyRegistration: companyData?.registration_number || "",
    companyAddress: companyData?.address || "",
    companyPhone: companyPhone,
    companyEmail: companyData?.email || "",
    companyWebsite: companyData?.website || "",
    companyLogoUrl: companyData?.logo_url || "",
    companySignatureUrl: companyData?.signature_url || "",
    
    // Customer data  
    customerName: customerName || "",
    customerTaxId: customerData?.tax_id || "",
    customerPhone: customerPhone,
    customerEmail: customerData?.email || "",
    customerAddress: customerData?.address_street ? 
      `${customerData.address_street}${customerData.address_city ? ', ' + customerData.address_city : ''}` : "",
    
    // Payments
    payments: payments.map((p, idx) => ({
      ...p,
      formattedDate: formatDate(p.date),
      formattedAmount: formatMoney(p.amount, p.currency),
      index: idx,
      isEven: idx % 2 === 0
    })),
    hasPayments: payments.length > 0,
    
    // Current time - using documentDate to avoid hydration mismatch
    currentTime: documentDate ? new Date(documentDate).toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' }) : "00:00",
    
    // Style settings
    styleSettings: styleSettings,
    
    // Aliases for backward compatibility with different template variable names
    LOGO_URL: companyData?.logo_url || "",
    USERCOMPANYNAME: companyName,
    USERID: companyData?.registration_number || "",
    USERADDRESS: companyData?.address || "",
    PHONE: companyPhone,
    EMAIL: companyData?.email || "",
    DOMAIN: companyData?.website || "",
    Datecreation: formatDate(documentDate),
    RECEIPTNUMBER: previewNumber || "",
    CLIENTNAME: customerName || "",
    BUSINESSID: customerData?.tax_id || "",
    CLIENTPHONE: customerPhone,
    SIGNATURE_URL: companyData?.signature_url || "",
    DOC_SUBTITLE: description || "",
    FOOTER_TEXT: footerNotes || "",
    FOOTER_META: documentDate ? `הופק ב- תאריך ${formatDate(documentDate)} שעה ${new Date(documentDate).toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' })}` : "",
    PAYMENT_METHOD: payments[0]?.method || "",
    PAYMENT_DESC: "",
    PAYMENT_DATE: payments[0] ? formatDate(payments[0].date) : "",
    PAYMENT_AMOUNT: payments[0] ? formatMoney(payments[0].amount, payments[0].currency) : "",
    TOTAL: formatMoney(total, currency)
  };
  
  // Function to process template with data
  const processTemplate = (html: string) => {
    try {
      let processed = html;
      
      console.log("🔵 [processTemplate] Starting with template length:", html.length);

    // 1. Handle loops first: {{#each payments}}...{{/each}}
    processed = processed.replace(
      /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (match, arrayName, template) => {
        const array = (templateData as any)[arrayName];
        console.log(`🔄 [processTemplate] Loop {{#each ${arrayName}}}:`, {
          isArray: Array.isArray(array),
          length: array?.length
        });
        
        if (!Array.isArray(array)) return "";

        return array
          .map((item: any, idx: number) => {
            let itemHtml = template;

            // Handle nested conditionals: {{#if this.prop}}...{{/if}}
            itemHtml = itemHtml.replace(
              /\{\{#if\s+this\.(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
              (m: string, prop: string, content: string) => {
                const value = item[prop];
                return value ? content : "";
              }
            );

            // Replace {{this.prop}} with item values (supports spaces)
            itemHtml = itemHtml.replace(
              /\{\{\s*this\.(\w+)\s*\}\}/g,
              (m: string, prop: string) => {
                const value = item[prop];
                return value !== undefined && value !== null ? String(value) : "";
              }
            );

            // Replace {{@index}} with array index (supports spaces)
            itemHtml = itemHtml.replace(/\{\{\s*@index\s*\}\}/g, String(idx));

            return itemHtml;
          })
          .join("");
      }
    );

    // 2. Handle regular conditionals: {{#if var}}...{{/if}}
    processed = processed.replace(
      /\{\{#if\s+([^\}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (match, expr, content) => {
        const path = expr.trim();
        const value = path
          .split(".")
          .reduce((obj: any, key: string) => obj?.[key], templateData);
        
        console.log(`🔀 [processTemplate] Conditional {{#if ${path}}}:`, {
          value: value,
          willShow: !!value
        });
        
        return value ? content : "";
      }
    );

    // 3. Replace regular variables: {{ var }} or {{var}} or {{user.name}}
    // Supports spaces and dot notation
    processed = processed.replace(
      /\{\{\s*([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*\}\}/g,
      (match, path) => {
        const value = path
          .split(".")
          .reduce((obj: any, key: string) => obj?.[key], templateData);
        
        if (value === undefined || value === null) {
          console.warn(`⚠️ [processTemplate] Variable {{${path}}} not found in templateData`);
          return "";
        }
        
        return String(value);
      }
    );

      console.log("✅ [processTemplate] Processing complete");
      return processed;
    } catch (error) {
      console.error("❌ [processTemplate] Error processing template:", error);
      setRenderError(error instanceof Error ? error.message : String(error));
      return `<div style="padding: 40px; text-align: center; color: red;">שגיאה בעיבוד התבנית: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  };
  
  // Use template if available, otherwise use hardcoded HTML
  const useTemplate = templateHtml && templateHtml.trim().length > 0;
  
  console.log("🎯 [PreviewClient] useTemplate decision:", {
    useTemplate,
    hasTemplateHtml: !!templateHtml,
    trimmedLength: templateHtml?.trim().length || 0
  });

  const handleDownloadPDF = async () => {
    const element = document.getElementById("receipt-pdf-root");
    if (!element) return;

    // Dynamic import to avoid SSR issues
    const html2pdf = (await import("html2pdf.js")).default;

    const opt = {
      margin: 10,
      filename: `receipt-${previewNumber || "draft"}.pdf`,
      image: { type: "jpeg" as const, quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
        imageTimeout: 0,
        backgroundColor: styleSettings.colors.background,
      },
      jsPDF: {
        unit: "pt" as const,
        format: "a4" as const,
        orientation: "portrait" as const,
      },
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div
      dir="rtl"
      style={{ minHeight: "100vh", background: "#F5F6F7", padding: "40px 20px" }}
    >
      {/* Error Display */}
      {renderError && (
        <div style={{
          maxWidth: "800px",
          margin: "20px auto",
          padding: "20px",
          background: "#fee",
          border: "2px solid #f00",
          borderRadius: "8px",
          textAlign: "center",
          color: "#c00",
          fontWeight: "bold"
        }}>
          שגיאה: {renderError}
        </div>
      )}
      
      {/* Override Tailwind's lab() and color-mix() + Apply style settings */}
      <style>{`
        /* PDF-optimized wrapper with stable layout */
        .receipt-pdf {
          width: 800px;
          max-width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
        }

        /* Logo container - prevent stretching */
        .receipt-logo {
          display: inline-block;
          max-width: 180px;
          margin-bottom: 16px;
        }

        .receipt-logo img {
          max-width: 180px;
          width: 100%;
          height: auto;
          object-fit: contain;
          display: block;
        }

        /* Ensure grid containers don't stretch images */
        .receipt-header {
          align-items: start;
        }

        #receipt-pdf-root,
        #receipt-pdf-root *,
        #receipt-pdf-root *::before,
        #receipt-pdf-root *::after {
          --color-blue-600: #2563eb !important;
          --color-gray-50: #f9fafb !important;
          --color-gray-100: #f3f4f6 !important;
          --color-gray-300: #d1d5db !important;
          --color-gray-400: #9ca3af !important;
          --color-gray-500: #6b7280 !important;
          --color-gray-600: #4b5563 !important;
          --color-black: #000000 !important;
          --color-white: #ffffff !important;

          --background: #ffffff !important;
          --foreground: #111827 !important;
          --card: #ffffff !important;
          --card-foreground: #111827 !important;
          --popover: #ffffff !important;
          --popover-foreground: #111827 !important;
          --primary: #5b7fc7 !important;
          --primary-foreground: #ffffff !important;
          --secondary: #f3f4f6 !important;
          --secondary-foreground: #111827 !important;
          --muted: #f3f4f6 !important;
          --muted-foreground: #6b7280 !important;
          --accent: #f3f4f6 !important;
          --accent-foreground: #111827 !important;
          --destructive: #ef4444 !important;
          --destructive-foreground: #ffffff !important;
          --border: #e5e7eb !important;
          --input: #e5e7eb !important;
          --ring: #5b7fc7 !important;

          /* Custom style settings */
          --receipt-bg: ${styleSettings.colors.background} !important;
          --receipt-text: ${styleSettings.colors.text} !important;
          --receipt-accent: ${styleSettings.colors.accent} !important;
          --receipt-header-bg: ${styleSettings.colors.headerBackground} !important;
          --receipt-header-text: ${styleSettings.colors.headerText} !important;
          --receipt-table-header-bg: ${styleSettings.colors.tableHeaderBackground} !important;
          --receipt-table-header-text: ${styleSettings.colors.tableHeaderText} !important;
          --receipt-table-border: ${styleSettings.colors.tableRowBorder} !important;
          --receipt-total-bg: ${styleSettings.colors.totalBoxBackground} !important;
          --receipt-total-border: ${styleSettings.colors.totalBoxBorder} !important;
        }
        
        ${styleSettings.customCss}
      `}</style>

      {/* Inject template CSS if available */}
      {useTemplate && templateCss && (
        <style dangerouslySetInnerHTML={{ __html: templateCss }} />
      )}

      {/* Download PDF Button - Floating */}
      <div
        style={{
          position: "fixed",
          bottom: 40,
          left: 40,
          zIndex: 1000,
        }}
      >
        <button
          onClick={handleDownloadPDF}
          style={{
            padding: "16px 32px",
            background: "#111827",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#1f2937";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 6px 16px rgba(0,0,0,0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#111827";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(0,0,0,0.15)";
          }}
        >
          <span>הורד PDF</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
      
      {/* Render template HTML or fallback to hardcoded */}
      {renderError ? (
        <div 
          id="receipt-pdf-root"
          className="receipt-document receipt-pdf"
          style={{ 
            width: "210mm", 
            minHeight: "297mm", 
            padding: "40px", 
            textAlign: "center", 
            color: "#c00",
            margin: "0 auto",
            background: "#fee",
            border: "2px solid #f00"
          }}
        >
          <h2>שגיאה בעיבוד התבנית</h2>
          <p>{renderError}</p>
          <p style={{marginTop: "20px", fontSize: "14px"}}>משתמש בתצוגה המוגדרת כברירת מחדל במקום...</p>
        </div>
      ) : useTemplate && isMounted ? (
        <iframe
          id="receipt-pdf-root"
          title="Receipt Preview"
          style={{
            width: "210mm",
            minHeight: "297mm",
            margin: "0 auto",
            display: "block",
            border: "1px solid #e5e7eb",
            boxShadow: "0 0 10px rgba(0,0,0,0.1)",
            background: "#ffffff",
          }}
          srcDoc={`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>קבלה</title>
  <style>
    /* CSS Reset + Safe Defaults */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      margin: 0;
      padding: 0;
      color: #000000;
      background: #ffffff;
      direction: rtl;
      font-family: Arial, 'Assistant', 'Heebo', sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }
    
    /* Hide broken images */
    img[src=""],
    img:not([src]),
    img[src="null"],
    img[src="undefined"] {
      display: none;
    }
    
    img {
      max-width: 100%;
      height: auto;
    }
    
    /* Template CSS */
    ${templateCss || ''}
  </style>
  <script>
    // Hide images that fail to load
    window.addEventListener('error', function(e) {
      if (e.target.tagName === 'IMG') {
        e.target.style.display = 'none';
      }
    }, true);
    
    // Auto-resize iframe to content height
    function resizeIframe() {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'resize', height: height }, '*');
    }
    
    window.addEventListener('load', resizeIframe);
    window.addEventListener('resize', resizeIframe);
    
    // Initial resize after a short delay to ensure content is rendered
    setTimeout(resizeIframe, 100);
  </script>
</head>
<body>
  ${processTemplate(templateHtml!)}
</body>
</html>`}
        />
      ) : useTemplate && !isMounted ? (
        <div 
          id="receipt-pdf-root"
          className="receipt-document receipt-pdf"
          style={{ 
            width: "210mm", 
            minHeight: "297mm", 
            padding: "40px", 
            textAlign: "center", 
            color: "#666",
            margin: "0 auto",
            background: "#ffffff"
          }}
        >
          טוען...
        </div>
      ) : (
        <div className="receipt-fallback-content">
      {/* Receipt Document - A4 Size Print-Ready View */}
      <div
        id="receipt-pdf-root"
        className="receipt-document receipt-pdf"
        style={{
          position: "relative",
          width: "210mm",
          minHeight: "297mm",
          margin: "0 auto",
          padding: `${styleSettings.layout.pagePaddingTop}mm ${styleSettings.layout.pagePaddingSide}mm`,
          background: styleSettings.colors.background,
          fontFamily: styleSettings.typography.fontFamily,
          fontSize: styleSettings.typography.baseFontSize,
          color: styleSettings.colors.text,
          boxShadow: "0 0 10px rgba(0,0,0,0.1)",
        }}
      >
        {/* HEADER SECTION – New 3-part layout */}
        <div
          className="receipt-header"
          style={{
            position: "relative",
            marginBottom: 32,
            minHeight: "244px",
          }}
        >
          {/* Part 1 & Part 2 Container – Right Side */}
          <div
            style={{
              position: "absolute",
              top: "50px",
              right: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              textAlign: "right",
            }}
          >
            {/* Part 1 – Document metadata */}
            <div className="receipt-part-1" style={{ marginBottom: "25px" }}>
              {/* Receipt creation date */}
              <div
                className="receipt-date"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "14px",
                  fontWeight: 700,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                {formatDate(documentDate)}
              </div>

              {/* Document title and number on same line */}
              <div
                className="receipt-title-and-number"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "32px",
                  fontWeight: 700,
                  lineHeight: "normal",
                  marginBottom: "20px",
                  marginTop: "10px",
                }}
              >
                <span className="receipt-title-text">קבלה </span>
                <span className="receipt-number">{previewNumber || ""}</span>
              </div>

              {/* Static text */}
              <div
                className="receipt-copy-text"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontFamily: "Assistant",
                  fontSize: "14px",
                  fontWeight: 400,
                  lineHeight: "normal",
                }}
              >
                העתק נאמן למקור
              </div>
            </div>

            {/* Part 2 – Customer details */}
            <div className="receipt-part-2" style={{ marginLeft: "60px" }}>
              {/* Customer name */}
              <div
                className="receipt-customer-name"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "14px",
                  fontWeight: 400,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                {customerName || "—"}
              </div>

              {/* Customer ID */}
              <div
                className="receipt-customer-id"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "14px",
                  fontWeight: 400,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                ח.פ. / ת.ז. {customerData?.tax_id || ""}
              </div>

              {/* Customer phone */}
              {customerPhone && (
                <div
                  className="receipt-customer-phone"
                  style={{
                    color: "#000",
                    textAlign: "right",
                    fontSize: "14px",
                    fontWeight: 400,
                    lineHeight: "normal",
                    direction: "ltr",
                  }}
                >
                  {customerPhone}
                </div>
              )}
            </div>
          </div>

          {/* Gray block below Parts 1-2 */}
          <div
            style={{
              position: "absolute",
              top: "50px",
              right: "20px",
              width: "351px",
              height: "244px",
              background: "#F0F0F0",
              zIndex: -1,
            }}
          />

          {/* Part 3 – Issuer/Company details (Left side) */}
          <div
            className="receipt-part-3"
            style={{
              position: "absolute",
              top: "50px",
              left: "20px",
              width: "170px",
              textAlign: "right",
            }}
          >
            {/* Logo */}
            {companyData?.logo_url && companyData.logo_url.trim() && (
              <div className="receipt-company-logo" style={{ marginBottom: "15px" }}>
                <img
                  src={companyData.logo_url}
                  alt="Company Logo"
                  style={{
                    maxWidth: "170px",
                    width: "100%",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* Business name */}
            <div
              className="receipt-company-name"
              style={{
                color: "#000",
                fontSize: "12px",
                fontWeight: 700,
                lineHeight: "normal",
                marginBottom: "15px",
              }}
            >
              {companyName}
            </div>

            {/* Company ID / VAT */}
            {companyData?.registration_number && (
              <div
                className="receipt-company-registration"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "12px",
                  fontWeight: 400,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                ע.מ. / ח.פ. {companyData.registration_number}
              </div>
            )}

            {/* Address */}
            {companyData?.address && (
              <div
                className="receipt-company-address"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "12px",
                  fontWeight: 400,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                כתובת {companyData.address}
              </div>
            )}

            {/* Phone */}
            {companyPhone && (
              <div
                className="receipt-company-phone"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "12px",
                  fontWeight: 400,
                  lineHeight: "normal",
                  marginBottom: "15px",
                  direction: "ltr",
                }}
              >
                נייד {companyPhone}
              </div>
            )}

            {/* Website */}
            {companyData?.website && (
              <div
                className="receipt-company-website"
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "12px",
                  fontWeight: 400,
                  lineHeight: "normal",
                  direction: "ltr",
                }}
              >
                אתר {companyData.website}
              </div>
            )}
          </div>
        </div>

        {description && (
          <div
            className="receipt-description-section"
            style={{
              marginTop: "40px",
              marginBottom: 20,
              marginLeft: "20px",
              marginRight: "20px",
            }}
          >
            <div className="receipt-description-text">
              <span className="receipt-description-value" style={{ fontSize: 20, color: styleSettings.colors.text }}>{description}</span>
            </div>
          </div>
        )}

        {/* Payment Methods Table – פירוט תקבולים */}
        {payments.length > 0 && (
          <div
            className="receipt-payments-section"
            style={{
              marginBottom: 20,
              marginLeft: "20px",
              marginRight: "20px",
            }}
          >
            {/* Table */}
            <div
              className="receipt-payments-table"
              style={{
                border: `1px solid ${styleSettings.colors.tableRowBorder}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Table Header */}
              <div
                className="receipt-payments-table-header"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 2fr 1fr",
                  background: styleSettings.colors.tableHeaderBackground,
                  borderBottom: `2px solid ${styleSettings.colors.tableRowBorder}`,
                  padding: "12px 16px",
                  gap: 16,
                }}
              >
                <div
                  className="receipt-payments-header-cell"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: styleSettings.colors.tableHeaderText,
                    textAlign: "right",
                  }}
                >
                  תאריך
                </div>
                <div
                  className="receipt-payments-header-cell"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: styleSettings.colors.tableHeaderText,
                    textAlign: "right",
                  }}
                >
                  אמצעי
                </div>
                <div
                  className="receipt-payments-header-cell"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: styleSettings.colors.tableHeaderText,
                    textAlign: "right",
                  }}
                >
                  פרטים נוספים
                </div>
                <div
                  className="receipt-payments-header-cell"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: styleSettings.colors.tableHeaderText,
                    textAlign: "right",
                  }}
                >
                  סכום
                </div>
              </div>

              {/* Table Rows */}
              {payments.map((p, idx) => {
                // Format additional payment details based on payment method
                const getPaymentDetails = (payment: any) => {
                  if (payment.method === "כרטיס אשראי") {
                    const parts = [];
                    if (payment.cardLastDigits) parts.push(`כרטיס: *${payment.cardLastDigits}`);
                    if (payment.cardType) parts.push(payment.cardType);
                    if (payment.cardDealType && payment.cardDealType !== "regular") parts.push(payment.cardDealType);
                    if (payment.cardInstallments && payment.cardInstallments > 1) parts.push(`${payment.cardInstallments} תשלומים`);
                    return parts.join(" | ");
                  }
                  
                  if (payment.method === "העברה בנקאית") {
                    const parts = [];
                    if (payment.bankName) parts.push(payment.bankName);
                    if (payment.bankBranch) parts.push(`סניף: ${payment.bankBranch}`);
                    if (payment.bankAccount) parts.push(`חשבון: ${payment.bankAccount}`);
                    return parts.join(" | ");
                  }
                  
                  if (payment.method === "צ׳ק") {
                    const parts = [];
                    if (payment.checkNumber) parts.push(`צ׳ק מס׳ ${payment.checkNumber}`);
                    if (payment.checkBank) parts.push(payment.checkBank);
                    if (payment.checkBranch) parts.push(`סניף: ${payment.checkBranch}`);
                    if (payment.checkAccount) parts.push(`חשבון: ${payment.checkAccount}`);
                    return parts.join(" | ");
                  }
                  
                  if ([
                    "Bit", "PayBox", "PayPal", "Apple Pay", "Google Pay", 
                    "Colu", "Pay", "Payoneer", "V-CHECK", "שווה כסף", 
                    "שובר מתנה", "שובר BuyME", "אתריום", "ביטקוין", 
                    "ניכוי חלק עובד טל״א"
                  ].includes(payment.method)) {
                    const parts = [];
                    if (payment.payerAccount) parts.push(`חשבון: ${payment.payerAccount}`);
                    if (payment.transactionReference) parts.push(`עסקה: ${payment.transactionReference}`);
                    return parts.join(" | ");
                  }
                  
                  if (payment.method === "ניכוי אחר" && payment.description) {
                    return payment.description;
                  }
                  
                  return "";
                };
                
                return (
                  <div
                    key={idx}
                    className="receipt-payment-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 2fr 1fr",
                      background: idx % 2 === 0 ? styleSettings.colors.background : styleSettings.colors.tableHeaderBackground,
                      borderBottom: idx < payments.length - 1 ? `1px solid ${styleSettings.colors.tableRowBorder}` : "none",
                      padding: "12px 16px",
                      gap: 16,
                    }}
                  >
                    <div
                      className="receipt-payment-date"
                      style={{
                        fontSize: 13,
                        color: styleSettings.colors.text,
                        textAlign: "right",
                      }}
                    >
                      {formatDate(p.date)}
                    </div>
                    <div
                      className="receipt-payment-method"
                      style={{
                        fontSize: 13,
                        color: styleSettings.colors.text,
                        textAlign: "right",
                        fontWeight: 600,
                      }}
                    >
                      {p.method || "—"}
                    </div>
                    <div
                      className="receipt-payment-details"
                      style={{
                        fontSize: 13,
                        color: styleSettings.colors.text,
                        textAlign: "right",
                      }}
                    >
                      {getPaymentDetails(p) || "—"}
                    </div>
                    <div
                      className="receipt-payment-amount"
                      style={{
                        fontSize: 13,
                        color: styleSettings.colors.text,
                        textAlign: "right",
                        fontWeight: 600,
                      }}
                    >
                      {formatMoney(p.amount, p.currency)}
                    </div>
                  </div>
                );
              })}

              {/* Total Row */}
              <div
                className="receipt-payments-total-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 2fr 1fr",
                  background: "#F0F0F0",
                  borderTop: `2px solid ${styleSettings.colors.totalBoxBorder}`,
                  padding: "12px 16px",
                  gap: 16,
                }}
              >
                <div></div>
                <div></div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: styleSettings.colors.text,
                    textAlign: "right",
                  }}
                >
                  סה״כ
                </div>
                <div
                  className="receipt-payments-total-amount"
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: styleSettings.colors.text,
                    textAlign: "right",
                  }}
                >
                  {formatMoney(total, currency)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Signature Section - Below payments table, aligned to left (right in RTL) */}
        {companyData?.signature_url && companyData.signature_url.trim() && (
          <div
            className="receipt-signature-section"
            style={{
              marginTop: "30px",
              marginBottom: "16px",
              marginLeft: "20px",
              marginRight: "20px",
              display: "flex",
              justifyContent: "flex-start", // Left side in RTL (שמאל)
              alignItems: "center",
            }}
          >
            <div
              className="receipt-signature-container"
              style={{
                textAlign: "center",
              }}
            >
              <img
                src={companyData.signature_url}
                alt="חתימת העסק"
                className="receipt-signature-image"
                style={{
                  maxWidth: "200px",
                  maxHeight: "80px",
                  objectFit: "contain",
                  display: "block",
                  marginBottom: "8px",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const container = e.currentTarget.closest('.receipt-signature-section') as HTMLElement;
                  if (container) container.style.display = 'none';
                }}
              />
              <div
                className="receipt-signature-line"
                style={{
                  borderTop: "1px solid #000",
                  width: "200px",
                  marginBottom: "4px",
                }}
              />
              <div
                className="receipt-signature-label"
                style={{
                  fontSize: "11px",
                  color: "#666",
                  fontWeight: 600,
                }}
              >
                חתימה
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {notes && (
          <div
            className="receipt-notes-internal"
            style={{
              marginBottom: 16,
              marginLeft: "20px",
              marginRight: "20px",
              padding: 12,
              background: "#fffbeb",
              borderRadius: 8,
              border: "1px solid #fde68a",
            }}
          >
            <div
              className="receipt-notes-internal-label"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#92400e",
                marginBottom: 4,
              }}
            >
              <span className="receipt-notes-internal-label-text">הערות פנימיות:</span>
            </div>
            <div className="receipt-notes-internal-text">
              <span className="receipt-notes-internal-value" style={{ fontSize: 13, color: "#78350f" }}>{notes}</span>
            </div>
          </div>
        )}

        {footerNotes && (
          <div
            className="receipt-notes-customer"
            style={{
              marginBottom: 16,
              marginLeft: "20px",
              marginRight: "20px",
              padding: 12,
              background: "#f0f9ff",
              borderRadius: 8,
              border: "1px solid #bae6fd",
            }}
          >
            <div
              className="receipt-notes-customer-label"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#075985",
                marginBottom: 4,
              }}
            >
              <span className="receipt-notes-customer-label-text">הערות ללקוח:</span>
            </div>
            <div className="receipt-notes-customer-text">
              <span className="receipt-notes-customer-value" style={{ fontSize: 13, color: "#0c4a6e" }}>{footerNotes}</span>
            </div>
          </div>
        )}

        {/* Footer - Bottom of page */}
        <div
          className="receipt-bottom-footer"
          style={{
            position: "absolute",
            bottom: "30px",
            left: 0,
            right: 0,
            width: "100%",
            textAlign: "center",
            fontSize: "12px",
            color: "#000",
            lineHeight: "1.8",
          }}
        >
          <div className="receipt-footer-line1" style={{ marginBottom: "8px" }}>
            מסמך מוחשב הופק על ידי israel.green
          </div>
          <div className="receipt-footer-line2">
            הופק ב- תאריך {formatDate(documentDate)} שעה {new Date().toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' })} קבלה {previewNumber || "—"} עמוד 1 מתוך 1
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
}
