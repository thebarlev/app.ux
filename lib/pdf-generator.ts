import jsPDF from "jspdf";
import { getSystemText } from "@/lib/system-texts";
import * as fs from "fs";
import * as path from "path";

// ===== UTILITY HELPERS FOR PDF GENERATION =====

/**
 * Reverse Hebrew text ONLY for RTL display in jsPDF
 * IMPORTANT: Use ONLY for text labels, NOT for numbers!
 */
const reverseText = (text: string): string => {
  // Check if text contains Hebrew characters
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  if (!hasHebrew) return text;
  
  // Reverse the text for proper RTL display
  return text.split('').reverse().join('');
};

/**
 * Keep text as LTR (Left-to-Right) - for numbers, emails, URLs
 * This ensures numbers are NOT reversed
 */
const keepLTR = (value: string | number): string => {
  return value.toString();
};

/**
 * Format mobile number with dash after 3rd digit
 * Example: "0545215193" -> "054-5215193"
 */
const formatMobile = (mobile: string): string => {
  if (!mobile) return "";
  
  // Remove any existing dashes or spaces
  const cleaned = mobile.replace(/[-\s]/g, "");
  
  // If 10 digits (Israeli mobile), add dash after 3rd digit
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  
  // Return as-is if not standard format
  return cleaned;
};

/**
 * Format phone number with dash after 2nd digit (landline)
 * Example: "0312345678" -> "03-12345678"
 */
const formatPhone = (phone: string): string => {
  if (!phone) return "";
  
  const cleaned = phone.replace(/[-\s]/g, "");
  
  // Israeli landline: 02/03/04/08/09 + 7 digits
  if (cleaned.length === 9 || cleaned.length === 10) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
  }
  
  return cleaned;
};

// Flag to track if font has been registered globally
let fontRegistered = false;
let fontData: string | null = null;

// Helper to safely set font
function safeSetFont(doc: jsPDF, fontName: string = "Alef", fontStyle: string = "normal") {
  try {
    doc.setFont(fontName, fontStyle);
  } catch (e) {
    // Fallback to helvetica if custom font fails
    console.warn(`[PDF] Could not set font ${fontName}, using helvetica`);
    doc.setFont("helvetica", "normal");
  }
}

// Load and register Hebrew font with jsPDF
// Using Alef font (89KB) instead of Assistant (290KB) to avoid jsPDF size limits
function registerHebrewFont(doc: jsPDF) {
  try {
    // Load font data once
    if (!fontData) {
      console.log("[PDF] Loading Alef Hebrew font from file...");
      const fontPath = path.join(process.cwd(), "public", "AlefRegular.ttf");
      
      if (!fs.existsSync(fontPath)) {
        console.error("[PDF] Font file not found at:", fontPath);
        console.warn("[PDF] Falling back to default font");
        return false;
      }
      
      // Read font file and convert to base64
      const fontBuffer = fs.readFileSync(fontPath);
      fontData = fontBuffer.toString("base64");
      console.log("[PDF] Font loaded successfully, size:", Math.round(fontData.length / 1024), "KB");
    }
    
    // Register font for this document
    console.log("[PDF] Registering font with jsPDF...");
    
    // Add the font file to the virtual file system
    doc.addFileToVFS("Alef-Regular.ttf", fontData);
    
    // Register the font with jsPDF
    doc.addFont("Alef-Regular.ttf", "Alef", "normal");
    
    console.log("[PDF] ✅ Hebrew font registered successfully");
    fontRegistered = true;
    return true;
    
  } catch (error) {
    console.error("[PDF] ❌ Error registering Hebrew font:", error);
    if (error instanceof Error) {
      console.error("[PDF] Error message:", error.message);
      console.error("[PDF] Error stack:", error.stack);
    }
    console.warn("[PDF] Falling back to default font");
    fontRegistered = false;
    return false;
  }
}

const getBusinessTypeLabel = async (type: string): Promise<string> => {
  const labels: Record<string, () => Promise<string>> = {
    osek_patur: () => getSystemText("business_type_osek_patur", "עוסק פטור"),
    osek_murshe: () => getSystemText("business_type_osek_murshe", "עוסק מורשה"),
    ltd: () => getSystemText("business_type_ltd", "בע״מ"),
    partnership: () => getSystemText("business_type_partnership", "שותפות"),
    other: () => getSystemText("business_type_other", "אחר"),
  };
  
  if (labels[type]) {
    return await labels[type]();
  }
  return type;
};

export type ReceiptPDFData = {
  documentNumber: string;
  issueDate: string;
  customerName: string;
  customerDetails?: {
    email?: string;
    phone?: string;
    mobile?: string;
    address?: string;
  };
  companyName: string;
  companyDetails?: {
    businessType?: string;
    registrationNumber?: string;
    address?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    website?: string;
    logoUrl?: string;
  };
  total: number;
  currency: string;
  payments: Array<{
    method: string;
    date: string;
    amount: number;
    currency: string;
    bankName?: string;
    branch?: string;
    accountNumber?: string;
  }>;
  notes?: string;
  footerNotes?: string;
  description?: string;
};

export async function generateReceiptPDF(data: ReceiptPDFData): Promise<jsPDF> {
  try {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    
    // Register Hebrew font BEFORE any text operations
    console.log("[PDF] Initializing PDF document...");
    const fontSuccess = registerHebrewFont(doc);
    
    // Set initial font
    if (fontSuccess) {
      console.log("[PDF] Hebrew font registered, setting as default font");
      safeSetFont(doc);
    } else {
      console.log("[PDF] Using default helvetica font");
      doc.setFont("helvetica", "normal");
    }
    
    // ===== PDF DEBUG LOGGING =====
    console.log("=== PDF DEBUG ===");
    console.log("Document number (original):", data.documentNumber);
    console.log("Document number (LTR):", keepLTR(data.documentNumber));
    console.log("Issue date:", data.issueDate);
    console.log("Customer name:", data.customerName);
    
    if (data.companyDetails?.mobile) {
      const formatted = formatMobile(data.companyDetails.mobile);
      console.log("Company mobile (original):", data.companyDetails.mobile);
      console.log("Company mobile (formatted):", formatted);
    }
    
    if (data.customerDetails?.mobile) {
      const formatted = formatMobile(data.customerDetails.mobile);
      console.log("Customer mobile (original):", data.customerDetails.mobile);
      console.log("Customer mobile (formatted):", formatted);
    }
    console.log("=================");
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = margin;

  // ===== RTL LAYOUT - RIGHT TO LEFT =====
  // In RTL, we start from the RIGHT side of the page
  const rightEdge = pageWidth - margin; // Right edge coordinate
  
  // ===== HEADER SECTION =====
  const headerHeight = 60;
  
  // Right side - Company Details (in RTL this is the "first" column)
  let companyY = yPos;
  const companyX = rightEdge; // Start from right edge
  
  // Logo placeholder - TOP RIGHT
  if (data.companyDetails?.logoUrl) {
    try {
      // Reserve space for logo: 25x25mm box at top right
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(companyX - 25, companyY, 25, 25);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text("LOGO", companyX - 12.5, companyY + 13, { align: "center" });
    } catch (e) {
      console.error("Failed to add logo to PDF:", e);
    }
  }
  companyY += data.companyDetails?.logoUrl ? 28 : 0;
  
  // Company name - RIGHT ALIGNED
  doc.setFontSize(12);
  safeSetFont(doc);
  doc.setTextColor(0, 0, 0);
  doc.text(reverseText(data.companyName), companyX, companyY, { align: "right" });
  companyY += 6;
  
  // Business details - RIGHT ALIGNED
  if (data.companyDetails) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    if (data.companyDetails.businessType && data.companyDetails.registrationNumber) {
      const typeLabel = await getBusinessTypeLabel(data.companyDetails.businessType);
      // RTL format: label on right, number on left
      doc.text(reverseText(typeLabel), companyX, companyY, { align: "right" });
      doc.text(keepLTR(data.companyDetails.registrationNumber), companyX - 35, companyY);
      companyY += 5;
    }
    
    if (data.companyDetails.address) {
      doc.text(reverseText(data.companyDetails.address), companyX, companyY, { align: "right" });
      companyY += 5;
    }
    
    // Mobile - RTL: "נייד: 054-5215193" (with proper spacing)
    if (data.companyDetails.mobile) {
      const mobileLabel = await getSystemText("receipt_mobile_label", "נייד");
      const formattedMobile = formatMobile(data.companyDetails.mobile);
      doc.text(reverseText(mobileLabel), companyX, companyY, { align: "right" });
      doc.text(keepLTR(formattedMobile), companyX - 30, companyY); // Increased spacing
      companyY += 5;
    }
    
    // Phone - RTL: "טלפון: 03-1234567" (with proper spacing)
    if (data.companyDetails.phone) {
      const phoneLabel = await getSystemText("receipt_phone_label", "טלפון");
      const formattedPhone = formatPhone(data.companyDetails.phone);
      doc.text(reverseText(phoneLabel), companyX, companyY, { align: "right" });
      doc.text(keepLTR(formattedPhone), companyX - 35, companyY); // Increased spacing
      companyY += 5;
    }
    
    if (data.companyDetails.email) {
      doc.text(keepLTR(data.companyDetails.email), companyX, companyY, { align: "right" });
      companyY += 5;
    }
    
    // Website
    if (data.companyDetails.website) {
      doc.text(keepLTR(data.companyDetails.website), companyX, companyY, { align: "right" });
      companyY += 5;
    }
  }
  
  // Center - Document Title & Number
  let titleY = yPos + 15;
  
  doc.setFontSize(24);
  safeSetFont(doc);
  doc.setTextColor(0, 0, 0);
  const receiptTitle = await getSystemText("receipt_title", "קבלה");
  doc.text(reverseText(receiptTitle), pageWidth / 2, titleY, { align: "center" });
  titleY += 8;
  
  // Document number - CENTER
  doc.setFontSize(18);
  doc.text(keepLTR(data.documentNumber), pageWidth / 2, titleY, { align: "center" });
  titleY += 6;
  
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const copyText = await getSystemText("receipt_copy_text", "העתק נאמן למקור");
  doc.text(reverseText(copyText), pageWidth / 2, titleY, { align: "center" });
  
  // Left side - Customer Details (in RTL this is on the left)
  let customerY = yPos;
  const customerX = margin + 60; // Left side with offset
  
  // "לכבוד:" and customer name in SAME LINE
  doc.setFontSize(10);
  safeSetFont(doc);
  doc.setTextColor(0, 0, 0);
  const toLabel = await getSystemText("receipt_to_label", "לכבוד:");
  doc.text(`${reverseText(toLabel)} ${reverseText(data.customerName)}`, customerX, customerY, { align: "right" });
  customerY += 8;
  
  // Customer contact details - LABEL ABOVE VALUE
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  
  if (data.customerDetails) {
    // Issue date
    const issueDateLabel = await getSystemText("receipt_issue_date_label", "תאריך הפקה:");
    doc.text(reverseText(issueDateLabel), customerX, customerY, { align: "right" });
    customerY += 4;
    doc.text(keepLTR(data.issueDate), customerX, customerY, { align: "right" });
    customerY += 6;
    
    // Mobile
    if (data.customerDetails.mobile) {
      const mobileLabel = await getSystemText("receipt_mobile_label", "נייד:");
      const formattedMobile = formatMobile(data.customerDetails.mobile);
      doc.text(reverseText(mobileLabel), customerX, customerY, { align: "right" });
      customerY += 4;
      doc.text(keepLTR(formattedMobile), customerX, customerY, { align: "right" });
      customerY += 6;
    }
    
    // Email
    if (data.customerDetails.email) {
      doc.text(reverseText("דוא״ל:"), customerX, customerY, { align: "right" });
      customerY += 4;
      doc.text(keepLTR(data.customerDetails.email), customerX, customerY, { align: "right" });
      customerY += 6;
    }
    
    // Address
    if (data.customerDetails.address) {
      doc.text(reverseText("כתובת:"), customerX, customerY, { align: "right" });
      customerY += 4;
      doc.text(reverseText(data.customerDetails.address), customerX, customerY, { align: "right" });
    }
  }
  
  // Separator line
  yPos += headerHeight + 5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, rightEdge, yPos);
  yPos += 10;

  // Description Header - like in the example ("ספטמבר")
  if (data.description) {
    doc.setFontSize(14);
    safeSetFont(doc);
    doc.setTextColor(0, 0, 0);
    doc.text(reverseText(data.description), rightEdge, yPos, { align: "right" });
    yPos += 10;
  }

  // Payments Table Header - RTL with 5 columns
  // Table header background
  doc.setFillColor(249, 250, 251);
  doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, "F");

  // Table headers - RTL (from right to left: סכום | תאריך | פרטים | אמצעי תשלום)
  doc.setFontSize(10);
  safeSetFont(doc);
  doc.setTextColor(0, 0, 0);
  
  const paymentMethodLabel = await getSystemText("receipt_payment_method_label", "אמצעי תשלום");
  const dateLabel = await getSystemText("receipt_date_label", "תאריך");
  const amountLabel = await getSystemText("receipt_amount_label", "סכום");
  const detailsLabel = "פרטים (אופציונלי)"; // Bank details column
  
  // Calculate column widths
  const tableWidth = pageWidth - 2 * margin;
  const col1Width = tableWidth * 0.25; // אמצעי תשלום (25%)
  const col2Width = tableWidth * 0.35; // פרטים (35%)
  const col3Width = tableWidth * 0.20; // תאריך (20%)
  const col4Width = tableWidth * 0.20; // סכום (20%)
  
  // RTL: Amount (rightmost), Date, Details, Method (leftmost)
  const col4X = rightEdge - 5; // סכום
  const col3X = col4X - col4Width - 5; // תאריך
  const col2X = col3X - col3Width - 5; // פרטים
  const col1X = margin + 5; // אמצעי תשלום
  
  doc.text(reverseText(amountLabel), col4X, yPos, { align: "right" });
  doc.text(reverseText(dateLabel), col3X, yPos, { align: "right" });
  doc.text(reverseText(detailsLabel), col2X, yPos, { align: "right" });
  doc.text(reverseText(paymentMethodLabel), col1X, yPos);
  yPos += 8;

  // Table rows - RTL
  safeSetFont(doc);
  doc.setFontSize(9);
  doc.setLineWidth(0.1);
  
  data.payments.forEach((payment, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 7, "F");
    }
    
    // RTL: Amount, Date, Details (bank info), Method
    const amountText = `${payment.currency} ${payment.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.text(keepLTR(amountText), col4X, yPos, { align: "right" });
    doc.text(keepLTR(payment.date), col3X, yPos, { align: "right" });
    
    // Show bank details if available
    let bankDetails = "";
    if (payment.bankName || payment.branch || payment.accountNumber) {
      const parts = [];
      if (payment.bankName) parts.push(reverseText(payment.bankName));
      if (payment.branch) parts.push(`${reverseText("סניף")}: ${keepLTR(payment.branch)}`);
      if (payment.accountNumber) parts.push(`${reverseText("חשבון")}: ${keepLTR(payment.accountNumber)}`);
      bankDetails = parts.join(" | ");
    }
    doc.text(bankDetails, col2X, yPos, { align: "right" });
    
    doc.text(reverseText(payment.method), col1X, yPos);
    yPos += 7;
  });

  yPos += 5;

  // Total box - RTL: "סכום כולל:" on right, amount on left
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.5);
  doc.rect(margin, yPos, pageWidth - 2 * margin, 12, "FD");
  
  doc.setFontSize(14);
  safeSetFont(doc);
  doc.setTextColor(0, 0, 0);
  const totalLabel = await getSystemText("receipt_total_label", "סכום כולל:");
  
  // RTL: Label on RIGHT, total amount on LEFT
  doc.text(reverseText(totalLabel), rightEdge - 5, yPos + 8, { align: "right" });
  const totalText = `${data.currency} ${data.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.text(keepLTR(totalText), margin + 5, yPos + 8);
  yPos += 18;

  // Notes sections - RTL with light gray background, no border
  if (data.notes) {
    doc.setFillColor(245, 245, 245); // Light gray background
    doc.rect(margin, yPos, pageWidth - 2 * margin, 15, "F"); // F = fill only, no border
    
    doc.setFontSize(9);
    safeSetFont(doc);
    doc.setTextColor(60, 60, 60);
    const internalNotesLabel = await getSystemText("receipt_internal_notes_label", "הערות פנימיות:");
    doc.text(reverseText(internalNotesLabel), rightEdge - 2, yPos + 5, { align: "right" });
    doc.setTextColor(80, 80, 80);
    doc.text(reverseText(data.notes), rightEdge - 2, yPos + 10, { align: "right", maxWidth: pageWidth - 2 * margin - 4 });
    yPos += 18;
  }

  if (data.footerNotes) {
    doc.setFillColor(245, 245, 245); // Light gray background
    doc.rect(margin, yPos, pageWidth - 2 * margin, 15, "F"); // F = fill only, no border
    
    doc.setFontSize(9);
    safeSetFont(doc);
    doc.setTextColor(60, 60, 60);
    const customerNotesLabel = await getSystemText("receipt_customer_notes_label", "הערות ללקוח:");
    doc.text(reverseText(customerNotesLabel), rightEdge - 2, yPos + 5, { align: "right" });
    doc.setTextColor(80, 80, 80);
    doc.text(reverseText(data.footerNotes), rightEdge - 2, yPos + 10, { align: "right", maxWidth: pageWidth - 2 * margin - 4 });
    yPos += 18;
  }

  // Footer
  const footerY = pageHeight - 20;
  doc.setLineWidth(0.2);
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  safeSetFont(doc);
  
  const footerGenText = await getSystemText("receipt_footer_generated_text", "מסמך זה הופק באופן דיגיטלי");
  const printDateLabel = await getSystemText("receipt_footer_print_date_label", "תאריך הדפסה:");
  doc.text(reverseText(footerGenText), pageWidth / 2, footerY + 5, { align: "center" });
  // Print date - RTL format with reversed date
  const printDate = new Date().toLocaleDateString("he-IL");
  const reversedDate = printDate.split('').reverse().join(''); // Reverse the entire date string for RTL
  doc.text(`${reversedDate} :${reverseText(printDateLabel)}`, pageWidth / 2, footerY + 9, { align: "center" });

  console.log("[PDF] ✅ PDF generated successfully");
  return doc;
  
  } catch (error) {
    console.error("[PDF] ❌ Critical error generating PDF:", error);
    console.error("[PDF] Error stack:", error instanceof Error ? error.stack : "No stack trace");
    
    // Create a simple error PDF instead of throwing
    const errorDoc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    
    errorDoc.setFontSize(16);
    errorDoc.text("Error generating PDF", 20, 20);
    errorDoc.setFontSize(12);
    errorDoc.text(error instanceof Error ? error.message : "Unknown error", 20, 30);
    
    console.log("[PDF] Returning error PDF instead of throwing");
    return errorDoc;
  }
}
