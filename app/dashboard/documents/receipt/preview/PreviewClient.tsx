"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
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
} | null;

export default function PreviewClient({
  customerData,
  companyData,
  styleSettings,
}: {
  customerData: CustomerData;
  companyData: CompanyData;
  styleSettings: ReceiptStyleSettings;
}) {
  const searchParams = useSearchParams();

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
  }, [previewNumber, companyName]);

  // Auto-download PDF if autoDownload parameter is set
  useEffect(() => {
    if (autoDownload) {
      // Wait for DOM to render, then trigger download
      const timer = setTimeout(() => {
        handleDownloadPDF();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoDownload]);

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
      style={{ minHeight: "100vh", background: "#f5f5f5", padding: "40px 20px" }}
    >
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

        @supports (color: lab(0% 0 0)) {
          #receipt-pdf-root,
          #receipt-pdf-root * {
            color: inherit !important;
            background-color: inherit !important;
            border-color: inherit !important;
          }
        }

        @supports (color: color-mix(in lab, red, red)) {
          #receipt-pdf-root,
          #receipt-pdf-root * {
            color: inherit !important;
            background-color: inherit !important;
            border-color: inherit !important;
          }
        }
        
        ${styleSettings.customCss}
      `}</style>

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

      {/* Receipt Document - A4 Size Print-Ready View */}
      <div
        id="receipt-pdf-root"
        className="receipt-document receipt-pdf"
        style={{
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
              top: "70px",
              right: "37px",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              textAlign: "right",
            }}
          >
            {/* Part 1 – Document metadata */}
            <div style={{ marginBottom: "25px" }}>
              {/* Receipt creation date */}
              <div
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "18px",
                  fontWeight: 700,
                  lineHeight: "normal",
                  marginBottom: "10px",
                }}
              >
                {formatDate(documentDate)}
              </div>

              {/* Document title */}
              <div
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "24px",
                  fontWeight: 700,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                קבלה
              </div>

              {/* Receipt serial number */}
              <div
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "20px",
                  fontWeight: 700,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                {previewNumber || ""}
              </div>

              {/* Static text */}
              <div
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
            <div>
              {/* "לכבוד" */}
              <div
                style={{
                  color: "#000",
                  textAlign: "right",
                  fontSize: "14px",
                  fontWeight: 400,
                  lineHeight: "normal",
                  marginBottom: "15px",
                }}
              >
                לכבוד
              </div>

              {/* Customer name */}
              <div
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
              {customerData && (
                <div
                  style={{
                    color: "#000",
                    textAlign: "right",
                    fontSize: "14px",
                    fontWeight: 400,
                    lineHeight: "normal",
                  }}
                >
                  ח.פ. / ת.ז. {/* Add actual customer ID field when available */}
                </div>
              )}
            </div>
          </div>

          {/* Gray block below Parts 1-2 */}
          <div
            style={{
              position: "absolute",
              top: "70px",
              right: "37px",
              width: "351px",
              height: "244px",
              background: "#F0F0F0",
              zIndex: -1,
            }}
          />

          {/* Part 3 – Issuer/Company details (Left side) */}
          <div
            style={{
              position: "absolute",
              top: "70px",
              left: "37px",
              width: "170px",
              textAlign: "right",
            }}
          >
            {/* Logo */}
            {companyData?.logo_url && (
              <div style={{ marginBottom: "15px" }}>
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
                />
              </div>
            )}

            {/* Business name */}
            <div
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
              marginBottom: 24,
              marginLeft: "37px",
              marginRight: "37px",
              padding: 12,
              background: styleSettings.colors.tableHeaderBackground,
              borderRadius: 8,
            }}
          >
            <div
              className="receipt-description-label"
              style={{
                fontSize: 12,
                color: styleSettings.colors.text,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              תיאור:
            </div>
            <div className="receipt-description-text" style={{ fontSize: 14, color: styleSettings.colors.text }}>{description}</div>
          </div>
        )}

        {/* Payment Methods – Horizontal Single Line */}
        <div
          className="receipt-payments-section"
          style={{
            marginBottom: 24,
            marginLeft: "37px",
            marginRight: "37px",
            padding: styleSettings.sections.paymentsTable.rowPaddingY,
            background: styleSettings.colors.tableHeaderBackground,
            borderRadius: 8,
          }}
        >
          <div
            className="receipt-payments-title"
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 12,
              color: styleSettings.colors.tableHeaderText,
            }}
          >
            אמצעי תשלום:
          </div>
          
          {payments.length === 0 ? (
            <div className="receipt-payments-empty" style={{ fontSize: 13, color: styleSettings.colors.text, opacity: 0.6 }}>
              אין אמצעי תשלום מוגדרים
            </div>
          ) : (
            <div
              className="receipt-payments-list"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 24,
                alignItems: "center",
              }}
            >
              {payments.map((p, idx) => (
                <div
                  key={idx}
                  className="receipt-payment-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: styleSettings.colors.text,
                  }}
                >
                  <span className="receipt-payment-method" style={{ fontWeight: 600 }}>
                    {p.method || "—"}
                  </span>
                  <span className="receipt-payment-separator">•</span>
                  <span className="receipt-payment-amount">{formatMoney(p.amount, p.currency)}</span>
                  {p.bankName && (
                    <>
                      <span className="receipt-payment-separator">•</span>
                      <span className="receipt-payment-bank" style={{ fontSize: 12, color: styleSettings.colors.text, opacity: 0.6 }}>
                        {p.bankName}
                        {p.branch && ` (${p.branch})`}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total */}
        <div
          className="receipt-total-section"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginLeft: "37px",
            marginRight: "37px",
            padding: styleSettings.sections.totalBox.padding,
            background: styleSettings.colors.totalBoxBackground,
            borderRadius: 8,
            border: `2px solid ${styleSettings.colors.totalBoxBorder}`,
            marginBottom: 24,
          }}
        >
          <div className="receipt-total-label" style={{ fontSize: 18, fontWeight: 700, color: styleSettings.colors.text }}>סה״כ לתשלום:</div>
          <div
            className="receipt-total-amount"
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: styleSettings.colors.text,
              textAlign: styleSettings.sections.totalBox.alignAmount,
            }}
          >
            {formatMoney(total, currency)}
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <div
            className="receipt-notes-internal"
            style={{
              marginBottom: 16,
              marginLeft: "37px",
              marginRight: "37px",
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
              הערות פנימיות:
            </div>
            <div className="receipt-notes-internal-text" style={{ fontSize: 13, color: "#78350f" }}>{notes}</div>
          </div>
        )}

        {footerNotes && (
          <div
            className="receipt-notes-customer"
            style={{
              marginBottom: 16,
              marginLeft: "37px",
              marginRight: "37px",
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
              הערות ללקוח:
            </div>
            <div className="receipt-notes-customer-text" style={{ fontSize: 13, color: "#0c4a6e" }}>
              {footerNotes}
            </div>
          </div>
        )}

        {/* Footer – Receipt Details */}
        <div
          className="receipt-footer"
          style={{
            marginTop: 40,
            marginLeft: "37px",
            marginRight: "37px",
            paddingTop: 20,
            borderTop: `2px solid ${styleSettings.colors.accent}`,
          }}
        >
          <div
            className="receipt-footer-meta"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div className="receipt-footer-meta-item receipt-footer-number">
              <div
                className="receipt-footer-meta-label"
                style={{
                  fontSize: 11,
                  color: styleSettings.colors.text,
                  opacity: 0.6,
                  marginBottom: 4,
                }}
              >
                מספר קבלה
              </div>
              <div className="receipt-footer-meta-value" style={{ fontSize: 13, fontWeight: 600, color: styleSettings.colors.text }}>
                {previewNumber || "טיוטה"}
              </div>
            </div>

            <div className="receipt-footer-meta-item receipt-footer-issue-date">
              <div
                className="receipt-footer-meta-label"
                style={{
                  fontSize: 11,
                  color: styleSettings.colors.text,
                  opacity: 0.6,
                  marginBottom: 4,
                }}
              >
                תאריך הנפקה
              </div>
              <div className="receipt-footer-meta-value" style={{ fontSize: 13, fontWeight: 600, color: styleSettings.colors.text }}>
                {formatDate(documentDate)}
              </div>
            </div>

            <div className="receipt-footer-meta-item receipt-footer-status">
              <div
                className="receipt-footer-meta-label"
                style={{
                  fontSize: 11,
                  color: styleSettings.colors.text,
                  opacity: 0.6,
                  marginBottom: 4,
                }}
              >
                סטטוס
              </div>
              <div className="receipt-footer-meta-value" style={{ fontSize: 13, fontWeight: 600, color: styleSettings.colors.text }}>
                {previewNumber ? "סופי" : "טיוטה"}
              </div>
            </div>
          </div>

          <div
            className="receipt-footer-signature"
            style={{
              textAlign: "center",
              fontSize: 11,
              color: styleSettings.colors.text,
              opacity: 0.5,
              marginTop: 16,
              paddingTop: 16,
              borderTop: `1px solid ${styleSettings.colors.tableRowBorder}`,
            }}
          >
            <div className="receipt-footer-signature-line1">מסמך זה הופק באופן דיגיטלי ב-{companyName}</div>
            <div className="receipt-footer-signature-line2" style={{ marginTop: 4 }}>
              תאריך יצירה: {new Date().toLocaleDateString("he-IL")} • {new Date().toLocaleTimeString("he-IL")}
            </div>
            <div className="receipt-footer-copyright" style={{ marginTop: 8, fontSize: 10, opacity: 0.7 }}>
              © כל הזכויות שמורות
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
