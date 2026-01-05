import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";

// ============================================================================
// Types
// ============================================================================

interface MonthSegment {
  from: Date;
  to: Date;
  key: string; // YYYY-MM
  label: string; // "נובמבר 2025"
}

interface MockDocument {
  id: string;
  docNumber: string;
  date: string;
  customerName: string;
  customerId: string;
  amount: number;
  vat: number;
  total: number;
}

interface PDFParams {
  businessId: string;
  from: Date;
  to: Date;
  documents: MockDocument[];
}

interface ZipParams {
  businessId: string;
  dateFrom: Date;
  dateTo: Date;
}

// ============================================================================
// Utilities
// ============================================================================

const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateFilename(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${formatDate(date)}`;
}

function formatMoney(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Split date range into monthly segments
 * Example: 01/11/2025-31/12/2025 => [Nov 2025, Dec 2025]
 */
export function splitRangeToMonths(dateFrom: Date, dateTo: Date): MonthSegment[] {
  const segments: MonthSegment[] = [];
  
  const current = new Date(dateFrom);
  const end = new Date(dateTo);
  
  while (current <= end) {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    
    const segmentStart = current.getTime() === monthStart.getTime() ? monthStart : new Date(current);
    const segmentEnd = end < monthEnd ? new Date(end) : monthEnd;
    
    const year = current.getFullYear();
    const month = current.getMonth();
    
    segments.push({
      from: segmentStart,
      to: segmentEnd,
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${HEBREW_MONTHS[month]} ${year}`,
    });
    
    // Move to next month
    current.setMonth(current.getMonth() + 1);
    current.setDate(1);
  }
  
  return segments;
}

/**
 * Generate MOCK documents for testing
 * TODO: Replace with real Supabase query
 */
function generateMockDocuments(from: Date, to: Date): MockDocument[] {
  const docs: MockDocument[] = [];
  const count = Math.floor(Math.random() * 5) + 3; // 3-7 documents
  
  for (let i = 0; i < count; i++) {
    const randomDate = new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
    const amount = Math.random() * 5000 + 500;
    const vat = amount * 0.17;
    
    docs.push({
      id: `DOC-${Date.now()}-${i}`,
      docNumber: `${70000 + i}`,
      date: formatDate(randomDate),
      customerName: `לקוח ${i + 1}`,
      customerId: `${300000000 + i}`,
      amount: Math.round(amount * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      total: Math.round((amount + vat) * 100) / 100,
    });
  }
  
  return docs.sort((a, b) => {
    const [dayA, monthA, yearA] = a.date.split('/').map(Number);
    const [dayB, monthB, yearB] = b.date.split('/').map(Number);
    const dateA = new Date(yearA, monthA - 1, dayA);
    const dateB = new Date(yearB, monthB - 1, dayB);
    return dateA.getTime() - dateB.getTime();
  });
}

/**
 * Build a single PDF for one month
 * Uses jsPDF + autoTable with RTL support
 */
export function buildIncomePdf({ businessId, from, to, documents }: PDFParams): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Calculate summaries
  const totalAmount = documents.reduce((sum, d) => sum + d.amount, 0);
  const totalVat = documents.reduce((sum, d) => sum + d.vat, 0);
  const totalWithVat = documents.reduce((sum, d) => sum + d.total, 0);
  const totalPaid = totalWithVat; // Assuming all paid

  let yPos = 20;

  // ===== Header =====
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  const title = 'דיווח הכנסות תקופתי';
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, 210 - 15 - titleWidth, yPos); // RTL: from right
  yPos += 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const period = `לתקופה ${formatDate(to)} - ${formatDate(from)}`;
  const periodWidth = doc.getTextWidth(period);
  doc.text(period, 210 - 15 - periodWidth, yPos);
  yPos += 15;

  // ===== Business Info (RTL aligned) =====
  doc.setFontSize(10);
  const businessInfo = [
    `ח.פ: ${businessId}`,
    'כתובת: רחוב הדוגמה 123, תל אביב',
    'טל: 03-1234567',
    'דוא"ל: info@example.com',
  ];
  
  businessInfo.forEach(line => {
    const lineWidth = doc.getTextWidth(line);
    doc.text(line, 210 - 15 - lineWidth, yPos);
    yPos += 5;
  });
  yPos += 5;

  // ===== Summary Boxes =====
  const boxY = yPos;
  const boxHeight = 15;
  const boxWidth = 80;
  
  // Right box - Total Income
  doc.setFillColor(100, 173, 241);
  doc.rect(210 - 15 - boxWidth, boxY, boxWidth, boxHeight, 'F');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('סה"כ הכנסות', 210 - 15 - boxWidth / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(14);
  doc.text(formatMoney(totalWithVat), 210 - 15 - boxWidth / 2, boxY + 12, { align: 'center' });
  
  // Left box - Total Paid
  doc.setFillColor(100, 200, 150);
  doc.rect(210 - 15 - boxWidth * 2 - 10, boxY, boxWidth, boxHeight, 'F');
  doc.text('סה"כ תקבולים', 210 - 15 - boxWidth - 5 - boxWidth / 2, boxY + 5, { align: 'center' });
  doc.text(formatMoney(totalPaid), 210 - 15 - boxWidth - 5 - boxWidth / 2, boxY + 12, { align: 'center' });
  
  doc.setTextColor(0, 0, 0);
  yPos = boxY + boxHeight + 10;

  // ===== Summary Table =====
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const summaryTitle = `סיכום הכנסות ותקבולים (${documents.length} מסמכים)`;
  const summaryTitleWidth = doc.getTextWidth(summaryTitle);
  doc.text(summaryTitle, 210 - 15 - summaryTitleWidth, yPos);
  yPos += 10;

  autoTable(doc, {
    startY: yPos,
    head: [['סיכום תקבולים', 'סיכום הכנסות']],
    body: [
      ['העברות בנקאיות: ₪0.00', `הכנסות חייבות: ${formatMoney(totalAmount)}`],
      ['כרטיסי אשראי: ₪0.00', 'הכנסות פטורות: ₪0.00'],
      ['מזומן: ₪0.00', `מע"מ: ${formatMoney(totalVat)}`],
      [`סה"כ שולם: ${formatMoney(totalPaid)}`, `סה"כ כולל מע"מ: ${formatMoney(totalWithVat)}`],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      halign: 'right',
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [100, 150, 200],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    margin: { right: 15, left: 15 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // ===== Documents Table =====
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const docsTitle = `פירוט מסמכים (${documents.length})`;
  const docsTitleWidth = doc.getTextWidth(docsTitle);
  doc.text(docsTitle, 210 - 15 - docsTitleWidth, yPos);
  yPos += 10;

  const tableData = documents.map(d => [
    formatMoney(d.total),
    formatMoney(d.vat),
    '₪0.00', // Exempt
    formatMoney(d.amount),
    `${d.customerName}\n${d.customerId}`,
    d.date,
    d.docNumber,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['סה"כ', 'מע"מ', 'פטור', 'חייב מע"מ', 'פרטי לקוח', 'תאריך', 'מס׳']],
    body: tableData,
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      halign: 'right',
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [100, 150, 200],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    margin: { right: 15, left: 15 },
  });

  // ===== Footer on all pages =====
  const pageCount = doc.getNumberOfPages();
  const generatedAt = formatDateTime(new Date());
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    
    const footerText = `הופק ב ${generatedAt} | עמוד ${i} מתוך ${pageCount}`;
    const footerWidth = doc.getTextWidth(footerText);
    doc.text(footerText, 210 - 15 - footerWidth, 285);
  }

  return doc.output('arraybuffer') as Uint8Array;
}

/**
 * Build ZIP file containing PDFs for each month
 */
export async function buildIncomeZip({ businessId, dateFrom, dateTo }: ZipParams): Promise<{
  zipBytes: Uint8Array;
  zipName: string;
}> {
  const zip = new JSZip();
  
  const segments = splitRangeToMonths(dateFrom, dateTo);
  
  for (const segment of segments) {
    // TODO: Replace with real Supabase query:
    // const documents = await getDocumentsFromSupabase(businessId, segment.from, segment.to);
    const documents = generateMockDocuments(segment.from, segment.to);
    
    const pdfBytes = buildIncomePdf({
      businessId,
      from: segment.from,
      to: segment.to,
      documents,
    });
    
    const pdfFilename = `Income.${businessId}.${formatDateFilename(segment.from)}-${formatDateFilename(segment.to)}.pdf`;
    zip.file(pdfFilename, pdfBytes);
  }
  
  const zipBytes = await zip.generateAsync({ type: 'uint8array' });
  
  const zipName = `Income.${businessId}.${formatDateFilename(dateFrom)}-${formatDateFilename(dateTo)}.zip`;
  
  return {
    zipBytes,
    zipName,
  };
}

// ============================================================================
// TODO: Supabase Integration
// ============================================================================

/**
 * TODO: Implement real data fetching from Supabase
 * 
 * async function getDocumentsFromSupabase(
 *   businessId: string,
 *   from: Date,
 *   to: Date
 * ): Promise<MockDocument[]> {
 *   const { createClient } = await import('@/lib/supabase/server');
 *   const supabase = await createClient();
 *   
 *   const { data, error } = await supabase
 *     .from('documents')
 *     .select('*')
 *     .eq('company_id', businessId)
 *     .gte('issue_date', from.toISOString().split('T')[0])
 *     .lte('issue_date', to.toISOString().split('T')[0])
 *     .eq('document_status', 'final')
 *     .order('issue_date', { ascending: true });
 *   
 *   if (error) throw error;
 *   
 *   return (data || []).map(doc => ({
 *     id: doc.id,
 *     docNumber: doc.document_number || '',
 *     date: formatDate(new Date(doc.issue_date)),
 *     customerName: doc.customer_name || '',
 *     customerId: doc.customers?.tax_id || '',
 *     amount: doc.subtotal || 0,
 *     vat: (doc.total_amount || 0) - (doc.subtotal || 0),
 *     total: doc.total_amount || 0,
 *   }));
 * }
 */
