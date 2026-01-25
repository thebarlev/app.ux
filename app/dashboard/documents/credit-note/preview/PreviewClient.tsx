"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReceiptStyleSettings } from "@/lib/types/receipt-style";

function getCurrencyCode(currencySymbol: string): string {
  const map: Record<string, string> = {
    "₪": "ILS",
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
  };
  return map[currencySymbol] || "ILS";
}

function formatMoney(amount: number, currency: string, language: "he" | "en") {
  const n = Number.isFinite(amount) ? amount : 0;
  const currencyCode = getCurrencyCode(currency);
  try {
    return new Intl.NumberFormat(language === "en" ? "en-US" : "he-IL", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: language === "en" ? "code" : "narrowSymbol",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toLocaleString(language === "en" ? "en-US" : "he-IL", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

function formatDate(dateStr: string, language: "he" | "en") {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(language === "en" ? "en-US" : "he-IL");
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
  company_name_en?: string;
  contact_first_name?: string;
  contact_first_name_en?: string;
  business_type?: string;
  registration_number?: string;
  company_number?: string;
  address?: string;
  street?: string;
  city?: string;
  postal_code?: string;
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
  documentDescriptionFromDb = "",
}: {
  customerData: CustomerData;
  companyData: CompanyData;
  styleSettings: ReceiptStyleSettings;
  templateHtml: string | null;
  templateCss: string | null;
  documentDescriptionFromDb?: string;
}) {
  const searchParams = useSearchParams();

  const [isMounted, setIsMounted] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [systemTexts, setSystemTexts] = useState<Record<string, string>>({});

  console.log("🔵 [PreviewClient] Rendering with template:", {
    hasTemplate: !!templateHtml,
    templateLength: templateHtml?.length || 0,
    hasCss: !!templateCss,
    cssLength: templateCss?.length || 0,
    isMounted,
  });

  const language = (searchParams.get("language") === "en" ? "en" : "he") as "he" | "en";
  const documentIdParam = searchParams.get("documentId") || "";
  const issue =
    (((searchParams.get("issue") || "") || (documentIdParam ? "copy" : "")).toLowerCase() as
      | "original"
      | "copy"
      | "") || "";
  const previewNumber = searchParams.get("previewNumber") || null;
  const companyNameBase =
    (language === "en" ? (companyData as any)?.company_name_en : companyData?.company_name) ||
    companyData?.company_name ||
    searchParams.get("companyName") ||
    "העסק שלי";
  const customerName = customerData?.name || searchParams.get("customerName") || "";
  const documentDate = searchParams.get("documentDate") || "";
  const description = searchParams.get("description") || documentDescriptionFromDb || "";
  const notes = searchParams.get("notes") || "";
  const footerNotes = searchParams.get("footerNotes") || "";
  const total = parseFloat(searchParams.get("total") || "0");
  const vatType = (searchParams.get("vatType") || "regular") as "regular" | "no_vat";
  const vatRateParam = parseFloat(searchParams.get("vatRate") || "");
  const vatAmountParam = parseFloat(searchParams.get("vatAmount") || "");
  const subtotalParam = parseFloat(searchParams.get("subtotal") || "");
  const vatRate = vatType === "no_vat" ? 0 : (Number.isFinite(vatRateParam) ? vatRateParam : 0);
  const subtotal = Number.isFinite(subtotalParam)
    ? subtotalParam
    : vatRate > 0
      ? Number((total / (1 + vatRate / 100)).toFixed(2))
      : total;
  const vatAmount = Number.isFinite(vatAmountParam)
    ? vatAmountParam
    : vatRate > 0
      ? Number((total - subtotal).toFixed(2))
      : 0;
  const currency = searchParams.get("currency") || "₪";
  const autoDownload = searchParams.get("autoDownload") === "true";

  useEffect(() => {
    let cancelled = false;
    async function loadTexts() {
      try {
        const qs = new URLSearchParams({ lang: language, page: "receipt" });
        const res = await fetch(`/api/system-texts?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setSystemTexts(json.texts || {});
      } catch {
        // ignore preview-only failures
      }
    }
    loadTexts();
    return () => {
      cancelled = true;
    };
  }, [language]);

  const customerPhone = customerData?.phone || customerData?.mobile || "";
  const companyPhone = companyData?.mobile_phone || companyData?.phone || "";
  const companyAddress =
    companyData?.address ||
    [companyData?.street, companyData?.city, companyData?.postal_code].filter(Boolean).join(", ") ||
    "";

  let payments: Array<{
    method: string;
    date: string;
    amount: number;
    currency: string;
    bankName?: string;
    branch?: string;
    accountNumber?: string;
    bankAccount?: string;
    bankBranch?: string;
    cardLastDigits?: string;
    cardType?: string;
    cardDealType?: string;
    cardInstallments?: number;
    checkBank?: string;
    checkBranch?: string;
    checkAccount?: string;
    checkNumber?: string;
    payerAccount?: string;
    transactionReference?: string;
    description?: string;
    reference?: string;
    reference_number?: string;
    notes?: string;
  }> = [];
  try {
    const paymentsStr = searchParams.get("payments");
    if (paymentsStr) {
      payments = JSON.parse(paymentsStr);
    }
  } catch (e) {
    console.error("Failed to parse payments:", e);
  }

  let items: Array<{
    label: string;
    sku: string;
    description: string;
    quantity: number;
    unitPrice: number;
    currency: string;
    vatMode: "before" | "included";
    lineTotal: number;
  }> = [];
  try {
    const itemsStr = searchParams.get("items");
    if (itemsStr) {
      items = JSON.parse(itemsStr);
    }
  } catch (e) {
    console.error("Failed to parse items:", e);
  }

  const PREVIEW_SCALE = 0.5;

  useEffect(() => {
    document.title = `חשבונית זיכוי${previewNumber ? ` - ${previewNumber}` : ""} - ${companyNameBase}`;
    setIsMounted(true);

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "resize" && event.data.height) {
        const iframe = document.getElementById("receipt-pdf-root") as HTMLIFrameElement;
        if (iframe) {
          const scaledHeight = event.data.height * PREVIEW_SCALE;
          iframe.style.height = `${event.data.height}px`;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [previewNumber, companyNameBase]);

  const escapeHtml = (text: string | null | undefined): string => {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const buildPaymentDetails = (payment: any): string => {
    const parts: string[] = [];

    if (payment.method === "כרטיס אשראי") {
      if (payment.cardLastDigits) parts.push(`*${payment.cardLastDigits}`);
      if (payment.cardType) parts.push(payment.cardType);
      if (payment.cardDealType && payment.cardDealType !== "regular") {
        const dealTypeMap: Record<string, string> = {
          regular: "רגיל",
          payments: "תשלומים",
          credit: "אשראי",
          deferred: "דחוי",
        };
        parts.push(dealTypeMap[payment.cardDealType] || payment.cardDealType);
      }
      if (payment.cardInstallments && payment.cardInstallments > 1)
        parts.push(`${payment.cardInstallments}`);
    } else if (payment.method === "העברה בנקאית") {
      const bankName = payment.bankName || payment.bank_name || null;
      const bankBranch = payment.bankBranch || payment.branch || payment.bank_branch || null;
      const bankAccount =
        payment.bankAccount || payment.accountNumber || payment.account_number || payment.bank_account || null;

      if (bankName) parts.push(bankName);
      if (bankBranch) parts.push(bankBranch);
      if (bankAccount) parts.push(bankAccount);
    } else if (payment.method === "צ׳ק") {
      if (payment.checkNumber) parts.push(`${payment.checkNumber}`);
      if (payment.checkBank) parts.push(payment.checkBank);
      if (payment.checkBranch) parts.push(`${payment.checkBranch}`);
      if (payment.checkAccount) parts.push(`${payment.checkAccount}`);
    } else if (
      [
        "Bit",
        "PayBox",
        "PayPal",
        "Apple Pay",
        "Google Pay",
        "Colu",
        "Pay",
        "Payoneer",
        "V-CHECK",
        "שווה כסף",
        "שובר מתנה",
        "שובר BuyME",
        "אתריום",
        "ביטקוין",
        "ניכוי חלק עובד טל״א",
      ].includes(payment.method)
    ) {
      if (payment.payerAccount) parts.push(`${payment.payerAccount}`);
      if (payment.transactionReference) parts.push(`${payment.transactionReference}`);
    } else if (payment.method === "ניכוי אחר" && payment.description) {
      return payment.description;
    }

    if (payment.reference_number && payment.reference_number !== payment.checkNumber)
      parts.push(`${payment.reference_number}`);
    if (payment.reference && payment.reference !== payment.reference_number) parts.push(`${payment.reference}`);
    if (payment.transactionReference) parts.push(`${payment.transactionReference}`);
    if (payment.notes) parts.push(`${payment.notes}`);
    if (payment.description && payment.method !== "ניכוי אחר") parts.push(`${payment.description}`);

    return parts.join(", ");
  };

  const generatePaymentsRowsHTML = () => {
    if (items.length === 0) return "";

    return items
      .map((item) => {
        const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
        const unit = Number(item.unitPrice || 0);
        const lineTotal = Number(item.lineTotal || unit * qty);
        const formattedUnit = formatMoney(unit, item.currency || currency, language);
        const formattedTotal = formatMoney(lineTotal, item.currency || currency, language);

        const escapedQty = escapeHtml(String(qty));
        const escapedDetails = escapeHtml(item.description || item.label || "");
        const escapedUnit = escapeHtml(formattedUnit);
        const escapedTotal = escapeHtml(formattedTotal);

        return `<tr>
  <td>${escapedQty}</td>
  <td>${escapedDetails}</td>
  <td>${escapedUnit}</td>
  <td>${escapedTotal}</td>
</tr>`;
      })
      .join("\n");
  };

  const paymentsRowsHTML = generatePaymentsRowsHTML();

  const templateData = {
    t: systemTexts,
    company: {
      company_name: companyNameBase,
      company_name_he: companyData?.company_name || "",
      company_name_en: (companyData as any)?.company_name_en || "",
      contact_first_name:
        language === "en"
          ? (companyData as any)?.contact_first_name_en || (companyData as any)?.contact_first_name || ""
          : (companyData as any)?.contact_first_name || "",
      company_tax_id: companyData?.registration_number || companyData?.company_number || "",
      company_address: companyAddress,
      company_phone: companyPhone,
      company_email: companyData?.email || "",
      company_website: companyData?.website || "",
      company_logo: companyData?.logo_url && companyData.logo_url.trim() ? companyData.logo_url : null,
    },

    customer: customerName
      ? {
          customer_name: customerName,
          customer_tax_id: customerData?.tax_id || "",
          customer_phone: customerPhone,
          customer_email: customerData?.email || "",
          customer_address: customerData?.address_street
            ? `${customerData.address_street}${customerData.address_city ? ", " + customerData.address_city : ""}`
            : "",
        }
      : null,

    document: {
      document_number: previewNumber || "",
      document_date: documentDate,
      document_type: "credit_note",
      language,
      direction: language === "en" ? "ltr" : "rtl",
    },

    payments: payments.map((p, idx) => {
      const paymentDetails = buildPaymentDetails(p);

      return {
        method: p.method || "",
        details: paymentDetails,
        display_date: formatDate(p.date, language),
        display_amount: formatMoney(p.amount, p.currency || currency, language),
        date: p.date,
        amount: p.amount,
        currency: p.currency || currency,
        formattedDate: formatDate(p.date, language),
        formattedAmount: formatMoney(p.amount, p.currency || currency, language),
        reference: (p as any).reference || (p as any).reference_number || null,
        description: (p as any).description || (p as any).notes || null,
        bankName: p.bankName,
        bankBranch: p.bankBranch || p.branch,
        bankAccount: p.bankAccount || p.accountNumber,
        cardLastDigits: p.cardLastDigits,
        cardType: p.cardType,
        cardDealType: p.cardDealType,
        cardInstallments: p.cardInstallments,
        checkBank: p.checkBank,
        checkBranch: p.checkBranch,
        checkAccount: p.checkAccount,
        checkNumber: p.checkNumber,
        payerAccount: p.payerAccount,
        transactionReference: p.transactionReference,
        index: idx,
        isEven: idx % 2 === 0,
      };
    }),
    items: items.map((item, idx) => ({
      description: item.description || item.label || "",
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.lineTotal,
      vat_rate: vatRate,
      index: idx,
      isEven: idx % 2 === 0,
    })),

    PAYMENTS_ROWS_HTML: paymentsRowsHTML,

    formatted_total: formatMoney(total, currency, language),
    formatted_date: formatDate(documentDate, language),

    TOTAL_AMOUNT: formatMoney(total, currency, language),

    notes_data: {
      notes: notes || null,
      footer_notes: footerNotes || null,
      signature: companyData?.signature_url && companyData.signature_url.trim() ? companyData.signature_url : null,
    },

    totals: {
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total_amount: total,
      currency: currency,
    },

    previewNumber: previewNumber || "",
    documentDate: formatDate(documentDate, language),
    description: description || "",
    notes: notes || "",
    footerNotes: footerNotes || "",
    total: total,
    currency: currency,
    formattedTotal: formatMoney(total, currency, language),

    companyName: companyNameBase,
    companyRegistration: companyData?.registration_number || "",
    companyAddress: companyData?.address || "",
    companyPhone: companyPhone,
    companyEmail: companyData?.email || "",
    companyWebsite: companyData?.website || "",
    companyLogoUrl: companyData?.logo_url && companyData.logo_url.trim() ? companyData.logo_url : null,
    companySignatureUrl:
      companyData?.signature_url && companyData.signature_url.trim() ? companyData.signature_url : null,

    customerName: customerName || "",
    customerTaxId: customerData?.tax_id || "",
    customerPhone: customerPhone,
    customerEmail: customerData?.email || "",
    customerAddress: customerData?.address_street
      ? `${customerData.address_street}${customerData.address_city ? ", " + customerData.address_city : ""}`
      : "",

    hasPayments: payments.length > 0,

    currentTime: documentDate
      ? new Date(documentDate).toLocaleTimeString(language === "en" ? "en-US" : "he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "00:00",

    styleSettings: styleSettings,

    LOGO_URL: companyData?.logo_url && companyData.logo_url.trim() ? companyData.logo_url : null,
    USERCOMPANYNAME: companyNameBase,
    USERID: companyData?.registration_number || companyData?.company_number || "",
    USERADDRESS: companyAddress || "",
    PHONE: companyPhone,
    EMAIL: companyData?.email || "",
    DOMAIN: companyData?.website || "",
    Datecreation: formatDate(documentDate, language),
    RECEIPTNUMBER: previewNumber || "",
    CLIENTNAME: customerName || "",
    BUSINESSID: customerData?.tax_id || "",
    CLIENTPHONE: customerPhone,
    SIGNATURE_URL: companyData?.signature_url && companyData.signature_url.trim() ? companyData.signature_url : null,
    DOC_SUBTITLE: description || "",
    FOOTER_TEXT: footerNotes || "",
    FOOTER_META: documentDate
      ? `הופק ב- תאריך ${formatDate(documentDate, language)} שעה ${new Date().toLocaleTimeString(
          language === "en" ? "en-US" : "he-IL",
          { hour: "2-digit", minute: "2-digit" }
        )}`
      : "",
    PAYMENT_METHOD: payments[0]?.method || "",
    PAYMENT_DESC: "",
    PAYMENT_DATE: payments[0] ? formatDate(payments[0].date, language) : "",
    PAYMENT_AMOUNT: payments[0] ? formatMoney(payments[0].amount, payments[0].currency, language) : "",
    TOTAL: formatMoney(total, currency, language),

    PAGE_NUMBER: "1",
    TOTAL_PAGES: "1",

    DOCUMENT_COPY_LABEL: "להמחשה בלבד",

    CURRENT_DATE_TIME: new Date().toLocaleString(language === "en" ? "en-US" : "he-IL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  (templateData as any).company_logo = (templateData as any).LOGO_URL;
  (templateData as any).company_email = companyData?.email || "";
  (templateData as any).company_phone = companyPhone || "";
  (templateData as any).company_address = companyAddress || "";
  (templateData as any).company_tax_id = (templateData as any).USERID || "";
  (templateData as any).customer_address = (templateData as any).customerAddress || "";
  (templateData as any).customer_tax_id = (templateData as any).BUSINESSID || "";
  (templateData as any).customer_email = (templateData as any).customerEmail || "";
  (templateData as any).customer_phone = customerPhone || "";
  (templateData as any).RECEIPTNNUMBER = (templateData as any).RECEIPTNUMBER || "";
  (templateData as any).DATE = formatDate(documentDate, language);
  (templateData as any).TIME = new Date().toLocaleTimeString(language === "en" ? "en-US" : "he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  (templateData as any).DESCRIPTION = description || "";
  (templateData as any).AMOUNT = formatMoney(total, currency, language);
  (templateData as any).NOTES = notes || "";

  const processTemplate = (html: string) => {
    try {
      let processed = html;

      console.log("🔵 [processTemplate] Starting with template length:", html.length);

      processed = processed.replace(
        /\{\{\{\s*([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*\}\}\}/g,
        (match, path) => {
          const value = path
            .split(".")
            .reduce((obj: any, key: string) => obj?.[key], templateData);

          if (value === undefined || value === null) {
            console.warn(`⚠️ [processTemplate] Variable {{{${path}}}} not found in templateData`);
            return "";
          }

          return String(value);
        }
      );

      processed = processed.replace(
        /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
        (match, arrayName, template) => {
          const array = (templateData as any)[arrayName];
          console.log(`🔄 [processTemplate] Loop {{#each ${arrayName}}}:`, {
            isArray: Array.isArray(array),
            length: array?.length,
          });

          if (!Array.isArray(array)) return "";

          return array
            .map((item: any, idx: number) => {
              let itemHtml = template;

              itemHtml = itemHtml.replace(
                /\{\{#if\s+this\.(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
                (m: string, prop: string, content: string) => {
                  const value = item[prop];
                  return value ? content : "";
                }
              );

              itemHtml = itemHtml.replace(/\{\{\s*this\.(\w+)\s*\}\}/g, (m: string, prop: string) => {
                const value = item[prop];
                return value !== undefined && value !== null ? String(value) : "";
              });

              itemHtml = itemHtml.replace(/\{\{\s*@index\s*\}\}/g, String(idx));

              return itemHtml;
            })
            .join("");
        }
      );

      processed = processed.replace(
        /\{\{#if\s+([^\}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (match, expr, content) => {
          const path = expr.trim();
          const value = path
            .split(".")
            .reduce((obj: any, key: string) => obj?.[key], templateData);

          console.log(`🔀 [processTemplate] Conditional {{#if ${path}}}:`, {
            value: value,
            willShow: !!value,
          });

          return value ? content : "";
        }
      );

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
      return `<div style="padding: 40px; text-align: center; color: red;">שגיאה בעיבוד התבנית: ${
        error instanceof Error ? error.message : String(error)
      }</div>`;
    }
  };

  const useTemplate = templateHtml && templateHtml.trim().length > 0;

  console.log("🎯 [PreviewClient] useTemplate decision:", {
    useTemplate,
    hasTemplateHtml: !!templateHtml,
    trimmedLength: templateHtml?.trim().length || 0,
    templateHtmlPreview: templateHtml?.substring(0, 100) || null,
    hasTemplateCss: !!templateCss,
    cssLength: templateCss?.length || 0,
  });

  if (!useTemplate && templateHtml) {
    console.warn("⚠️ [PreviewClient] Template HTML exists but useTemplate is false - possible whitespace issue:", {
      originalLength: templateHtml.length,
      trimmedLength: templateHtml.trim().length,
    });
  }

  if (useTemplate && !templateCss) {
    console.warn("⚠️ [PreviewClient] Using template but CSS is missing - template may not render correctly");
  }

  const handleDownloadPDF = async () => {
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      alert("כדי להוריד PDF יש לסיים (Finalize) את המסמך.\n\nPDF ניתן להוריד רק למסמכים שסויימו.");
      return;
    }

    try {
      const pdfUrl = `/api/documents/${documentId}/pdf`;
      const response = await fetch(pdfUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.details || errorData.error || response.statusText;
        throw new Error(`PDF download failed: ${errorMessage}`);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("Downloaded PDF is empty");
      }

      const pdfBlob = new Blob([blob], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      const contentDisposition = response.headers.get("content-disposition") || "";
      const mQuoted = contentDisposition.match(/filename="([^"]+)"/i);
      const mStar = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      const serverFileName = mQuoted?.[1] || (mStar?.[1] ? decodeURIComponent(mStar[1]) : null);
      link.download = serverFileName || `${previewNumber || documentId}-he.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
      console.error("[PreviewClient] PDF download error:", error);
      alert(`שגיאה בהורדת PDF: ${error.message}\n\nאנא נסה שוב או פנה לתמיכה.`);
    }
  };
  // TEMP DEBUG: remove after verification
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const w = window as any;
    if (w.__RECEIPT_PREVIEW_KEYS_DEBUG_ONCE__) return;
    w.__RECEIPT_PREVIEW_KEYS_DEBUG_ONCE__ = true;

    const keys = [
      "RECEIPTNUMBER",
      "Datecreation",
      "DOCUMENT_COPY_LABEL",
      "CLIENTNAME",
      "BUSINESSID",
      "CLIENTPHONE",
      "LOGO_URL",
      "USERCOMPANYNAME",
      "USERID",
      "USERADDRESS",
      "PHONE",
      "EMAIL",
      "DOMAIN",
      "description",
      "PAYMENTS_ROWS_HTML",
      "TOTAL_AMOUNT",
      "notes",
      "SIGNATURE_URL",
      "CURRENT_DATE_TIME",
      "PAGE_NUMBER",
      "TOTAL_PAGES",
    ] as const;

    const rows = keys.map((key) => {
      const v = (templateData as any)[key];
      const type = v === null ? "null" : typeof v;
      const length = typeof v === "string" ? v.length : 0;
      return { key, type, length, truthy: !!v, value: v };
    });

    console.table(rows);
  }, [language]);

  return (
    <div dir={language === "en" ? "ltr" : "rtl"} style={{ minHeight: "100vh", background: "#F5F6F7", padding: "40px 20px" }}>
      {renderError && (
        <div
          style={{
            maxWidth: "800px",
            margin: "20px auto",
            padding: "20px",
            background: "#fee",
            border: "2px solid #f00",
            borderRadius: "8px",
            textAlign: "center",
            color: "#c00",
            fontWeight: "bold",
          }}
        >
          שגיאה: {renderError}
        </div>
      )}

      <style>{`
        .receipt-pdf {
          width: 800px;
          max-width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
        }

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

      {useTemplate && templateCss && <style dangerouslySetInnerHTML={{ __html: templateCss }} />}

      {searchParams.get("documentId") && (
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
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#111827";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
          >
            <span>הורד PDF</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      )}

      {renderError ? (
        <div
          id="receipt-pdf-root"
          className="receipt-document receipt-pdf"
          style={{
            width: "100%",
            minHeight: "297mm",
            padding: "40px",
            textAlign: "center",
            color: "#c00",
            margin: "0 auto",
            background: "#fee",
            border: "2px solid #f00",
          }}
        >
          <h2>שגיאה בעיבוד התבנית</h2>
          <p>{renderError}</p>
          <p style={{ marginTop: "20px", fontSize: "14px" }}>משתמש בתצוגה המוגדרת כברירת מחדל במקום...</p>
        </div>
      ) : useTemplate && isMounted ? (
        (() => {
          console.log("🎨 [PreviewClient] Rendering template HTML in iframe:", {
            templateHtmlLength: templateHtml?.length || 0,
            templateCssLength: templateCss?.length || 0,
            isMounted,
          });

          let processedTemplateHtml = templateHtml || "";
          const beforeLength = processedTemplateHtml.length;
          processedTemplateHtml = processedTemplateHtml.replace(
            /<link[^>]*rel=["']stylesheet["'][^>]*>/gi,
            ""
          );

          if (beforeLength !== processedTemplateHtml.length) {
            console.log("🔧 [PreviewClient] Removed external CSS links from template HTML");
          }

          const processedHtml = processTemplate(processedTemplateHtml);
          console.log("✅ [PreviewClient] Template processed and ready to render in iframe:", {
            processedLength: processedHtml.length,
            hasContent: processedHtml.trim().length > 0,
          });

          return (
            <div style={{ display: "flex", justifyContent: "center" }}>
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
                  zoom: PREVIEW_SCALE,
                }}
                srcDoc={`<!DOCTYPE html>
<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>חשבונית זיכוי</title>
  <style>
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
      direction: ${language === "en" ? "ltr" : "rtl"};
      font-family: Arial, 'Assistant', 'Heebo', sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }

    body {
      padding-top: 100px;
      box-sizing: border-box;
    }
    
    img[src=""],
    img:not([src]),
    img[src="null"],
    img[src="undefined"],
    img[src*="undefined"],
    img[src*="null"] {
      display: none !important;
    }
    
    img[src*="logo"],
    img[src*="signature"],
    img[src*="business-logos"],
    img[src*="business-signatures"],
    .brand-logo img,
    .company-logo img,
    .receipt-logo img,
    .signature img,
    .stamp img {
      display: block !important;
      max-width: 100%;
      height: auto;
      object-fit: contain;
    }
    
    img {
      max-width: 100%;
      height: auto;
    }
    
    ${templateCss || ""}
  </style>
  <script>
    window.addEventListener('error', function(e) {
      if (e.target.tagName === 'IMG') {
        e.target.style.display = 'none';
      }
    }, true);
    
    function resizeIframe() {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({
        type: 'resize',
        height: height,
        rootW: null,
        rootH: null,
        docScrollH: document.documentElement.scrollHeight,
        bodyW: document.body.clientWidth,
        bodyH: document.body.clientHeight,
        scale: 1,
      }, '*');
    }
    
    window.addEventListener('load', resizeIframe);
    window.addEventListener('resize', resizeIframe);
    
    setTimeout(resizeIframe, 100);
  </script>
</head>
<body>
  ${processedHtml}
</body>
</html>`}
              />
            </div>
          );
        })()
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
            background: "#ffffff",
          }}
        >
          טוען...
        </div>
      ) : (
        (() => {
          console.warn("⚠️ [PreviewClient] Falling back to hardcoded HTML - template not available:", {
            useTemplate,
            hasTemplateHtml: !!templateHtml,
            templateHtmlLength: templateHtml?.length || 0,
            isMounted,
          });
          return (
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
                {formatDate(documentDate, language)}
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
              {customerData?.tax_id && (
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
                  {customerData.tax_id}
                </div>
              )}

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
                    e.currentTarget.style.display = "none";
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
              {companyNameBase}
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
                {companyData.registration_number}
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
                {companyData.address}
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
                {companyPhone}
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
                {companyData.website}
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
              <span className="receipt-description-value" style={{ fontSize: 20, color: styleSettings.colors.text }}>
                {description}
              </span>
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
                const getPaymentDetails = (payment: any) => {
                  return buildPaymentDetails(payment);
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
                      {formatDate(p.date, language)}
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
                      {formatMoney(p.amount, p.currency, language)}
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
                  {formatMoney(total, currency, language)}
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
              justifyContent: "flex-start",
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
                  e.currentTarget.style.display = "none";
                  const container = e.currentTarget.closest(".receipt-signature-section") as HTMLElement;
                  if (container) container.style.display = "none";
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
            <div className="receipt-notes-internal-text">
              <span className="receipt-notes-internal-value" style={{ fontSize: 13, color: "#78350f" }}>
                {notes}
              </span>
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
            <div className="receipt-notes-customer-text">
              <span className="receipt-notes-customer-value" style={{ fontSize: 13, color: "#0c4a6e" }}>
                {footerNotes}
              </span>
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
            הופק ב- תאריך {formatDate(documentDate, language)} שעה{" "}
            {new Date().toLocaleTimeString(language === "en" ? "en-US" : "he-IL", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            קבלה {previewNumber || "—"} עמוד 1 מתוך 1
          </div>
        </div>
      </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
