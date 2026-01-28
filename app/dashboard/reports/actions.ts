"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import JSZip from "jszip";

/**
 * Split date range into monthly segments
 * Example: 01/11/2025-31/12/2025 => [01/11-30/11, 01/12-31/12]
 */
function splitIntoMonthlyRanges(startDate: string, endDate: string): Array<{ from: string; to: string; month: string }> {
  const segments: Array<{ from: string; to: string; month: string }> = [];
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let current = new Date(start);
  
  while (current <= end) {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    
    const segmentStart = current.getTime() === monthStart.getTime() ? monthStart : current;
    const segmentEnd = end < monthEnd ? end : monthEnd;
    
    segments.push({
      from: segmentStart.toISOString().split('T')[0],
      to: segmentEnd.toISOString().split('T')[0],
      month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
    });
    
    // Move to next month
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
  
  return segments;
}

/**
 * Format date to DD/MM/YYYY
 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format date for filename: DD.MM.YYYY
 */
function formatDateFilename(dateStr: string): string {
  return formatDate(dateStr).replace(/\//g, '.');
}

/**
 * Format money with ₪ symbol and 2 decimals
 */
function formatMoney(amount: number): string {
  return `₪ ${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n") || raw.includes("\r")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const header = columns.join(",");
  if (rows.length === 0) return `${header}\n`;
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

const ITEM_DOCUMENT_TYPES = new Set(["tax_invoice", "receipt_invoice", "credit_invoice"]);
const PAYMENT_DOCUMENT_TYPES = new Set(["receipt", "donation_receipt", "donation_cancel"]);

const INCOMES_COLUMNS = [
  "document_id",
  "document_type",
  "document_number",
  "document_date",
  "customer_name",
  "customer_id",
  "subtotal_amount",
  "vat_amount",
  "total_amount",
  "currency",
  "document_status",
  "original_document_id",
  "created_at",
  "closed_at",
];

const LINE_ITEMS_COLUMNS = [
  "line_item_id",
  "document_id",
  "item_name",
  "item_sku",
  "description",
  "quantity",
  "unit_price",
  "line_subtotal",
  "vat_rate",
  "vat_amount",
  "line_total",
  "income_account",
];

const PAYMENTS_COLUMNS = [
  "payment_id",
  "document_id",
  "payment_date",
  "payment_method",
  "payment_amount",
  "reference",
  "bank_name",
  "branch",
  "account",
  "check_number",
  "notes",
];

/**
 * Get documents for date range
 */
async function getDocumentsForRange(
  companyId: string,
  fromDate: string,
  toDate: string,
  documentTypes?: string[],
  customerId?: string
) {
  const supabase = await createClient();
  
  let query = supabase
    .from('documents')
    .select(`
      id,
      document_type,
      document_number,
      issue_date,
      created_at,
      finalized_at,
      customer_id,
      customer_name,
      subtotal,
      vat_rate,
      vat_amount,
      total_amount,
      currency,
      document_status,
      accounting_status,
      customers (
        id,
        name,
        tax_id
      ),
      document_line_items (
        id,
        document_id,
        line_number,
        description,
        quantity,
        unit_price,
        line_total,
        currency,
        item_date,
        item_sku,
        bank_name,
        branch,
        account_number,
        payment_metadata
      )
    `)
    .eq('company_id', companyId)
    .eq('document_status', 'final')
    .gte('issue_date', fromDate)
    .lte('issue_date', toDate)
    .order('issue_date', { ascending: true });
  
  // Filter by document types if specified
  if (documentTypes && documentTypes.length > 0 && !documentTypes.includes('all')) {
    query = query.in('document_type', documentTypes);
  }
  
  // Filter by customer if specified
  if (customerId) {
    query = query.eq('customer_id', customerId);
  }
  
  const { data, error } = await query;
  
  if (error) throw new Error(`Failed to fetch documents: ${error.message}`);
  
  return data || [];
}

/**
 * Calculate summary statistics from documents
 */
function calculateSummary(documents: any[]) {
  const summary = {
    // Income breakdown
    income_taxable: 0,
    income_exempt: 0,
    income_mixed: 0,
    income_total_ex_vat: 0,
    vat_total: 0,
    withholding_tax: 0,
    income_total_inc_vat: 0,
    
    // Payment breakdown
    bank_transfer: 0,
    credit_card: 0,
    check: 0,
    cash: 0,
    paypal: 0,
    payment_apps: 0,
    other_payment: 0,
    paid_total: 0,
    
    // Document count
    document_count: documents.length,
  };
  
  documents.forEach(doc => {
    // Income calculation
    const subtotal = doc.subtotal || 0;
    const vat = (doc.total_amount || 0) - subtotal;
    
    summary.income_taxable += subtotal;
    summary.vat_total += vat;
    summary.income_total_inc_vat += doc.total_amount || 0;
    
    // Payment breakdown from line items
    (doc.document_line_items || []).forEach((item: any) => {
      const paymentMethod = item.metadata?.method || '';
      const amount = item.total_price || 0;
      
      if (paymentMethod.includes('בנק') || paymentMethod.includes('העברה')) {
        summary.bank_transfer += amount;
      } else if (paymentMethod.includes('כרטיס') || paymentMethod.includes('אשראי')) {
        summary.credit_card += amount;
      } else if (paymentMethod.includes('צ\'ק')) {
        summary.check += amount;
      } else if (paymentMethod.includes('מזומן')) {
        summary.cash += amount;
      } else if (paymentMethod.toLowerCase().includes('paypal')) {
        summary.paypal += amount;
      } else if (paymentMethod.includes('ביט') || paymentMethod.includes('פייבוקס')) {
        summary.payment_apps += amount;
      } else if (amount > 0) {
        summary.other_payment += amount;
      }
      
      summary.paid_total += amount;
      
      // Check for withholding tax
      if (item.description?.includes('ניכוי במקור')) {
        summary.withholding_tax += amount;
      }
    });
  });
  
  summary.income_total_ex_vat = summary.income_taxable + summary.income_exempt + summary.income_mixed;
  
  return summary;
}

/**
 * Generate income report (PDF or other formats)
 */
export type GenerateIncomeReportResult =
  | {
      ok: true;
      reports: Array<{
        filename: string;
        month: string;
        from: string;
        to: string;
        summary: any;
        documentCount: number;
      }>;
      totalMonths: number;
      companyName: string;
      companyId: string;
      documentCount?: number;
      download?: { filename: string; base64: string };
    }
  | {
      ok: false;
      error: string;
    };

export async function generateIncomeReportAction(params: {
  startDate: string;
  endDate: string;
  documentTypes: string[];
  customerId?: string;
  customerName?: string;
  fileFormat: string;
  scope: '10000' | '500000';
  emails?: string[];
}): Promise<GenerateIncomeReportResult> {
  try {
    const companyId = await getCompanyIdForUser();
    const supabase = await createClient();
    
    // Get company details
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    
    if (!company) {
      return { ok: false as const, error: 'Company not found' };
    }

    if (params.fileFormat === "csv") {
      const documents = await getDocumentsForRange(
        companyId,
        params.startDate,
        params.endDate,
        params.documentTypes,
        params.customerId
      );

      const docIds = documents.map((doc: any) => String(doc.id));
      const originalDocMap = new Map<string, string>();
      if (docIds.length > 0) {
        const { data: links } = await supabase
          .from("document_links")
          .select("source_document_id, target_document_id")
          .eq("company_id", companyId)
          .in("link_type", ["credit", "cancellation"])
          .in("target_document_id", docIds);
        for (const link of links || []) {
          const targetId = String((link as any).target_document_id);
          const sourceId = String((link as any).source_document_id);
          if (!originalDocMap.has(targetId)) originalDocMap.set(targetId, sourceId);
        }
      }

      const incomesRows = documents.map((doc: any) => {
        const customerTaxId =
          String((doc?.customers as any)?.tax_id || "").trim() ||
          String(doc.customer_id || "").trim() ||
          "";
        const customerName = String((doc?.customers as any)?.name || doc.customer_name || "").trim();
        return {
          document_id: doc.id,
          document_type: doc.document_type,
          document_number: doc.document_number || "",
          document_date: doc.issue_date || "",
          customer_name: customerName,
          customer_id: customerTaxId,
          subtotal_amount: doc.subtotal ?? "",
          vat_amount: doc.vat_amount ?? "",
          total_amount: doc.total_amount ?? "",
          currency: doc.currency || "",
          document_status: doc.accounting_status ?? doc.document_status ?? "",
          original_document_id: originalDocMap.get(String(doc.id)) || "",
          created_at: doc.created_at || "",
          closed_at: doc.finalized_at || "",
        };
      });

      const lineItemRows: Array<Record<string, unknown>> = [];
      const paymentRows: Array<Record<string, unknown>> = [];
      for (const doc of documents) {
        const docType = doc.document_type;
        const items = Array.isArray(doc.document_line_items) ? doc.document_line_items : [];
        if (ITEM_DOCUMENT_TYPES.has(docType)) {
          for (const item of items) {
            const metadata = item.payment_metadata || {};
            lineItemRows.push({
              line_item_id: item.id || "",
              document_id: item.document_id || doc.id,
              item_name: metadata.label || item.description || "",
              item_sku: metadata.sku || item.item_sku || "",
              description: metadata.details || item.description || "",
              quantity: item.quantity ?? "",
              unit_price: item.unit_price ?? "",
              line_subtotal: item.line_total ?? "",
              vat_rate: doc.vat_rate ?? "",
              vat_amount: "",
              line_total: item.line_total ?? "",
              income_account: metadata.incomeAccount || metadata.income_account || "",
            });
          }
        }
        if (PAYMENT_DOCUMENT_TYPES.has(docType)) {
          for (const item of items) {
            const metadata = item.payment_metadata || {};
            paymentRows.push({
              payment_id: item.id || "",
              document_id: item.document_id || doc.id,
              payment_date: item.item_date || doc.issue_date || "",
              payment_method: item.description || metadata.label || "",
              payment_amount: item.line_total ?? item.unit_price ?? "",
              reference:
                metadata.reference ||
                metadata.reference_number ||
                metadata.transactionReference ||
                metadata.checkNumber ||
                "",
              bank_name: item.bank_name || metadata.bankName || "",
              branch: item.branch || metadata.bankBranch || metadata.branch || "",
              account: item.account_number || metadata.bankAccount || metadata.accountNumber || "",
              check_number: metadata.checkNumber || "",
              notes: metadata.description || metadata.notes || "",
            });
          }
        }
      }

      const incomesCsv = buildCsv(INCOMES_COLUMNS, incomesRows);
      const lineItemsCsv = buildCsv(LINE_ITEMS_COLUMNS, lineItemRows);
      const paymentsCsv = buildCsv(PAYMENTS_COLUMNS, paymentRows);

      const zip = new JSZip();
      zip.file("incomes.csv", incomesCsv);
      zip.file("line-items.csv", lineItemsCsv);
      zip.file("payments.csv", paymentsCsv);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const zipFilename = `Income.${company.registration_number || companyId}.${formatDateFilename(params.startDate)}-${formatDateFilename(params.endDate)}.zip`;

      return {
        ok: true as const,
        reports: [],
        totalMonths: 1,
        companyName: company.company_name,
        companyId: company.registration_number || companyId,
        documentCount: documents.length,
        download: { filename: zipFilename, base64: zipBuffer.toString("base64") },
      };
    }
    
    // Split date range into monthly segments
    const monthlySegments = splitIntoMonthlyRanges(params.startDate, params.endDate);
    
    const reports: Array<{
      filename: string;
      month: string;
      from: string;
      to: string;
      summary: any;
      documentCount: number;
    }> = [];
    
    // Generate report for each month
    for (const segment of monthlySegments) {
      const documents = await getDocumentsForRange(
        companyId,
        segment.from,
        segment.to,
        params.documentTypes,
        params.customerId
      );
      
      const summary = calculateSummary(documents);
      
      const filename = `Income.${company.registration_number || companyId}.${formatDateFilename(segment.from)}-${formatDateFilename(segment.to)}.pdf`;
      
      reports.push({
        filename,
        month: segment.month,
        from: segment.from,
        to: segment.to,
        summary,
        documentCount: documents.length,
      });
    }
    
    // TODO: Implement actual PDF generation here
    // For now, return metadata
    
    return {
      ok: true as const,
      reports,
      totalMonths: monthlySegments.length,
      companyName: company.company_name,
      companyId: company.registration_number,
    };
    
  } catch (error: any) {
    console.error('Generate report error:', error);
    return {
      ok: false as const,
      error: error.message || 'Failed to generate report',
    };
  }
}

/**
 * Get company details for report header
 */
export async function getCompanyDetailsForReport() {
  try {
    const companyId = await getCompanyIdForUser();
    const supabase = await createClient();
    
    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    
    if (error) throw error;
    
    return {
      ok: true,
      company: {
        name: company.company_name,
        taxId: company.registration_number,
        address: company.address,
        phone: company.mobile_phone,
        email: company.email,
        businessType: company.business_type,
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message,
    };
  }
}
