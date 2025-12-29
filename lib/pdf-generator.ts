import jsPDF from "jspdf";

// Hebrew font support - using Arial Unicode MS equivalent
// Note: For production, you may want to add a proper Hebrew font
const addHebrewSupport = (doc: jsPDF) => {
  // jsPDF doesn't natively support RTL or Hebrew well
  // For now we'll reverse strings manually for Hebrew text
  // In production, consider using: jspdf-arabic or custom fonts
};

const reverseHebrew = (text: string): string => {
  // Simple reversal for Hebrew text (basic solution)
  // For production, use a proper BiDi library
  return text.split('').reverse().join('');
};

const getBusinessTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    osek_patur: "Osek Patur",
    osek_murshe: "Osek Murshe",
    ltd: "Ltd.",
    partnership: "Partnership",
    other: "Other",
  };
  return labels[type] || type;
};

export type ReceiptPDFData = {
  documentNumber: string;
  issueDate: string;
  customerName: string;
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
  }>;
  notes?: string;
  footerNotes?: string;
  description?: string;
};

export function generateReceiptPDF(data: ReceiptPDFData): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  // Logo on left side (if provided)
  if (data.companyDetails?.logoUrl) {
    try {
      // Note: Adding logo requires base64 conversion
      // In production, fetch and convert logo to base64
      // For now, we'll reserve space for it
      // doc.addImage(logoBase64, 'PNG', margin, yPos, 30, 30);
    } catch (e) {
      console.error("Failed to add logo to PDF:", e);
    }
  }

  // Header - Company Name (centered)
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(data.companyName, pageWidth / 2, yPos, { align: "center" });
  yPos += 8;

  // Company Details (right side, smaller text)
  if (data.companyDetails) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const rightX = pageWidth - margin;
    let detailY = yPos;

    if (data.companyDetails.businessType) {
      const typeLabel = getBusinessTypeLabel(data.companyDetails.businessType);
      doc.text(typeLabel, rightX, detailY, { align: "right" });
      detailY += 4;
    }
    if (data.companyDetails.registrationNumber) {
      doc.text(`Reg: ${data.companyDetails.registrationNumber}`, rightX, detailY, { align: "right" });
      detailY += 4;
    }
    if (data.companyDetails.address) {
      const addressLines = doc.splitTextToSize(data.companyDetails.address, 70);
      doc.text(addressLines, rightX, detailY, { align: "right" });
      detailY += addressLines.length * 4;
    }
    if (data.companyDetails.phone) {
      doc.text(`Phone: ${data.companyDetails.phone}`, rightX, detailY, { align: "right" });
      detailY += 4;
    }
    if (data.companyDetails.mobile) {
      doc.text(`Mobile: ${data.companyDetails.mobile}`, rightX, detailY, { align: "right" });
      detailY += 4;
    }
    if (data.companyDetails.email) {
      doc.text(data.companyDetails.email, rightX, detailY, { align: "right" });
      detailY += 4;
    }
    yPos = Math.max(yPos + 10, detailY);
  } else {
    yPos += 10;
  }

  // Title - Receipt
  doc.setFontSize(18);
  doc.setTextColor(59, 130, 246); // Blue color
  doc.text("RECEIPT / KVALA", pageWidth / 2, yPos, { align: "center" });
  yPos += 8;

  // Document Number
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(`Number: ${data.documentNumber}`, pageWidth / 2, yPos, { align: "center" });
  yPos += 12;

  // Line separator
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Document Info (2 columns)
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Issue Date:", margin, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.issueDate, margin + 30, yPos);

  doc.setFont("helvetica", "bold");
  doc.text("Customer:", pageWidth / 2 + 10, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.customerName, pageWidth / 2 + 35, yPos);
  yPos += 10;

  // Description (if exists)
  if (data.description) {
    doc.setFont("helvetica", "bold");
    doc.text("Description:", margin, yPos);
    yPos += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const descLines = doc.splitTextToSize(data.description, pageWidth - 2 * margin);
    doc.text(descLines, margin, yPos);
    yPos += descLines.length * 5 + 5;
  }

  yPos += 5;

  // Payments Table Header
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Payment Details", margin, yPos);
  yPos += 7;

  // Table header background
  doc.setFillColor(249, 250, 251);
  doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, "F");

  doc.setFontSize(10);
  doc.text("Payment Method", margin + 2, yPos);
  doc.text("Date", margin + 70, yPos);
  doc.text("Amount", pageWidth - margin - 40, yPos);
  yPos += 8;

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.1);
  
  data.payments.forEach((payment, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 7, "F");
    }
    
    doc.text(payment.method, margin + 2, yPos);
    doc.text(payment.date, margin + 70, yPos);
    const amountText = `${payment.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payment.currency}`;
    doc.text(amountText, pageWidth - margin - 2, yPos, { align: "right" });
    yPos += 7;
  });

  yPos += 5;

  // Total box
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.5);
  doc.rect(margin, yPos, pageWidth - 2 * margin, 12, "FD");
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Total Amount:", margin + 5, yPos + 8);
  const totalText = `${data.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.currency}`;
  doc.text(totalText, pageWidth - margin - 5, yPos + 8, { align: "right" });
  yPos += 18;

  // Notes sections
  if (data.notes) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 10 + data.notes.length * 0.1, "FD");
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(146, 64, 14);
    doc.text("Internal Notes:", margin + 2, yPos + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 53, 15);
    const notesLines = doc.splitTextToSize(data.notes, pageWidth - 2 * margin - 4);
    doc.text(notesLines, margin + 2, yPos + 9);
    yPos += 10 + notesLines.length * 4;
  }

  if (data.footerNotes) {
    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(186, 230, 253);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 10 + data.footerNotes.length * 0.1, "FD");
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(7, 89, 133);
    doc.text("Customer Notes:", margin + 2, yPos + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(12, 74, 110);
    const footerLines = doc.splitTextToSize(data.footerNotes, pageWidth - 2 * margin - 4);
    doc.text(footerLines, margin + 2, yPos + 9);
    yPos += 10 + footerLines.length * 4;
  }

  // Footer
  const footerY = pageHeight - 20;
  doc.setLineWidth(0.2);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.setFont("helvetica", "normal");
  doc.text("This document was generated digitally", pageWidth / 2, footerY + 5, { align: "center" });
  doc.text(`Print Date: ${new Date().toLocaleDateString("en-US")}`, pageWidth / 2, footerY + 9, { align: "center" });

  return doc;
}
