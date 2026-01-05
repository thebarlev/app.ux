"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";

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
      *,
      customers (
        id,
        name,
        tax_id
      ),
      document_line_items (
        *
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
export async function generateIncomeReportAction(params: {
  startDate: string;
  endDate: string;
  documentTypes: string[];
  customerId?: string;
  customerName?: string;
  fileFormat: string;
  scope: '10000' | '500000';
  emails?: string[];
}) {
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
      return { ok: false, error: 'Company not found' };
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
      ok: true,
      reports,
      totalMonths: monthlySegments.length,
      companyName: company.company_name,
      companyId: company.registration_number,
    };
    
  } catch (error: any) {
    console.error('Generate report error:', error);
    return {
      ok: false,
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
