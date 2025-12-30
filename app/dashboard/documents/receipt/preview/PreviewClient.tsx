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
      style={{ minHeight: "100vh", background: "#ffffff", padding: "40px 20px" }}
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
              top: "70px",
              right: "37px",
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
            <div className="receipt-part-2" style={{ marginLeft: "57px" }}>
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
            className="receipt-part-3"
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
              marginTop: "80px",
              marginBottom: 24,
              marginLeft: "37px",
              marginRight: "37px",
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
              marginBottom: 24,
              marginLeft: "37px",
              marginRight: "37px",
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
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
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
                  פרטים (אופציונלי)
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
              </div>

              {/* Table Rows */}
              {payments.map((p, idx) => (
                <div
                  key={idx}
                  className="receipt-payment-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 1fr",
                    background: idx % 2 === 0 ? styleSettings.colors.background : styleSettings.colors.tableHeaderBackground,
                    borderBottom: idx < payments.length - 1 ? `1px solid ${styleSettings.colors.tableRowBorder}` : "none",
                    padding: "12px 16px",
                    gap: 16,
                  }}
                >
                  <div
                    className="receipt-payment-details"
                    style={{
                      fontSize: 13,
                      color: styleSettings.colors.text,
                      textAlign: "right",
                      direction: "ltr",
                    }}
                  >
                    {p.bankName && (
                      <>
                        {p.bankName}
                        {p.branch && ` ${p.branch}`}
                        {p.accountNumber && ` ${p.accountNumber}`}
                      </>
                    )}
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
                </div>
              ))}

              {/* Total Row */}
              <div
                className="receipt-payments-total-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  background: "#F0F0F0",
                  borderTop: `2px solid ${styleSettings.colors.totalBoxBorder}`,
                  padding: "12px 16px",
                  gap: 16,
                }}
              >
                <div></div>
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
                <div style={{ gridColumn: "3 / 5", fontSize: 14, fontWeight: 700, color: styleSettings.colors.text, textAlign: "right" }}>
                  סה״כ
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Signature Section - Below payments table, aligned to left (right in RTL) */}
        {companyData?.signature_url && (
          <div
            className="receipt-signature-section"
            style={{
              marginTop: "40px",
              marginBottom: "16px",
              marginLeft: "37px",
              marginRight: "37px",
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
  );
}
