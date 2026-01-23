/**
 * Document Date Validation System
 * 
 * Business Rules:
 * - Each document type tracks the last finalized issue_date
 * - New documents must have issue_date >= last_issue_date
 * - Multiple documents can share the same date (including today)
 * - Validation enforced per (company_id, document_type)
 * - Date constraints only apply to finalized documents, not drafts
 */

import { createClient } from "@/lib/supabase/server";

export type DateValidationResult = {
  isValid: boolean;
  minAllowedDate: string | null; // YYYY-MM-DD format or null if no constraint
  errorMessage: string | null;
};

/**
 * Get the minimum allowed issue_date for a document type
 * Returns the last finalized issue_date, or null if no documents exist
 */
export async function getMinAllowedIssueDate(
  companyId: string,
  documentType: string
): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_sequences")
    .select("last_issue_date")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .maybeSingle();

  if (error || !data) {
    return null; // No constraint - first document
  }

  return data.last_issue_date || null;
}

/**
 * Validate that a proposed issue_date is allowed for a document type
 * Uses the database function for consistency
 */
export async function validateDocumentIssueDate(
  companyId: string,
  documentType: string,
  proposedDate: string // YYYY-MM-DD format
): Promise<DateValidationResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("validate_document_issue_date", {
    p_company_id: companyId,
    p_document_type: documentType,
    p_issue_date: proposedDate,
  });

  if (error) {
    console.error("Date validation RPC error:", error);
    return {
      isValid: false,
      minAllowedDate: null,
      errorMessage: `שגיאת מערכת: ${error.message}`,
    };
  }

  // RPC returns array with single row
  const result = Array.isArray(data) ? data[0] : data;

  return {
    isValid: result.is_valid ?? false,
    minAllowedDate: result.min_allowed_date || null,
    errorMessage: result.error_message || null,
  };
}

/**
 * Validate issue_date before creating/finalizing a document
 * Throws an error if validation fails
 */
export async function validateIssueDateOrThrow(
  companyId: string,
  documentType: string,
  issueDate: string
): Promise<void> {
  const validation = await validateDocumentIssueDate(
    companyId,
    documentType,
    issueDate
  );

  if (!validation.isValid) {
    throw new Error(
      validation.errorMessage || "תאריך המסמך אינו תקין"
    );
  }
}

/**
 * Get date validation info for UI (date picker restrictions)
 * Returns min date and formatted message
 */
export async function getDateRestrictionInfo(
  companyId: string,
  documentType: string
): Promise<{
  minDate: string | null; // YYYY-MM-DD or null
  message: string | null;
  hasRestriction: boolean;
}> {
  const minDate = await getMinAllowedIssueDate(companyId, documentType);

  if (!minDate) {
    return {
      minDate: null,
      message: null,
      hasRestriction: false,
    };
  }

  // Format Hebrew date message
  const formattedDate = formatIsraeliDate(minDate);
  const message = `המסמך האחרון הונפק ב-${formattedDate}. ניתן לבחור רק תאריכים מ-${formattedDate} ואילך.`;

  return {
    minDate,
    message,
    hasRestriction: true,
  };
}

/**
 * Format date as DD/MM/YYYY (Israeli format)
 */
export function formatIsraeliDate(dateString: string): string {
  if (!dateString) return "";
  
  try {
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayYMD(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Compare two dates in YYYY-MM-DD format
 * Returns: -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDates(date1: string, date2: string): number {
  if (date1 === date2) return 0;
  return date1 < date2 ? -1 : 1;
}

/**
 * Check if a date is in the past (before today)
 */
export function isPastDate(dateString: string): boolean {
  return compareDates(dateString, getTodayYMD()) < 0;
}

/**
 * Get date constraint examples for UI help text
 */
export function getDateConstraintExamples(
  lastIssueDate: string | null,
  documentTypeLabel: string
): string[] {
  if (!lastIssueDate) {
    return [
      `זהו המסמך הראשון מסוג ${documentTypeLabel} - ניתן לבחור כל תאריך`,
    ];
  }

  const today = getTodayYMD();
  const formatted = formatIsraeliDate(lastIssueDate);

  const examples: string[] = [];

  if (lastIssueDate === today) {
    examples.push(`המסמך האחרון הונפק היום - ניתן ליצור מסמכים נוספים היום בלבד`);
    examples.push(`תאריכים עבר חסומים עד סוף היום`);
  } else if (isPastDate(lastIssueDate)) {
    examples.push(`המסמך האחרון הונפק ב-${formatted}`);
    examples.push(`ניתן לבחור ${formatted} או כל תאריך מאוחר יותר`);
    examples.push(`תאריכים לפני ${formatted} חסומים`);
  } else {
    // Future date (unusual but possible)
    examples.push(`המסמך האחרון מתוזמן ל-${formatted}`);
    examples.push(`ניתן לבחור רק ${formatted} ואילך`);
  }

  return examples;
}

/**
 * Server action helper: Extract and validate date from payload
 */
export async function validateDocumentDateInPayload(
  companyId: string,
  documentType: string,
  issueDate: string | undefined,
  fieldName: string = "תאריך המסמך"
): Promise<{ ok: true } | { ok: false; message: string }> {
  // Check date provided
  if (!issueDate) {
    return { ok: false, message: `חובה למלא ${fieldName}` };
  }

  // Validate format (basic)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    return { ok: false, message: `${fieldName} אינו בפורמט תקין` };
  }

  // Validate against last issue date
  try {
    await validateIssueDateOrThrow(companyId, documentType, issueDate);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error.message || "תאריך לא תקין" };
  }
}
