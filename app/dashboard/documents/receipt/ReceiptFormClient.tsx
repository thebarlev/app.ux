"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { InitialReceiptCreateData } from "./actions";
import type { PaymentRow, ReceiptDraftPayload } from "@/lib/types/receipt";
import {
  issueReceiptAction,
  saveReceiptDraftAction,
  updateReceiptDraftAction,
  getRecipientConsentStatusAction,
  giveRecipientConsentAction,
  revokeRecipientConsentAction,
} from "./actions";
import { getReceiptPreviewUrlAction } from "../receipts/actions";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import ReceiptPreviewModal from "@/components/documents/ReceiptPreviewModal";
import ReceiptConfirmationModal from "@/components/documents/ReceiptConfirmationModal";
import ReceiptSuccessModal from "@/components/documents/ReceiptSuccessModal";
import PaymentDetailsSection from "./PaymentDetailsSection";
import ReceiptSettingsSummary from "@/components/documents/receipt/ReceiptSettingsSummary";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyAmountGroup } from "@/components/ui/currency-amount-group";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { cn } from "@/lib/utils";
import { isDigitalSignaturesEnabledClient } from "@/lib/documents/signing/feature-flags-client";
import { FileText, Save, CheckCircle, Settings as SettingsIcon, Trash2, Plus, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";

const PAYMENT_METHODS = [
  "העברה בנקאית",
  "Bit",
  "PayBox",
  "כרטיס אשראי",
  "מזומן",
  "צ׳ק",
  "PayPal",
  "Payoneer",
  "Google Pay",
  "Apple Pay",
  "ביטקוין",
  "אתריום",
  "שובר BuyME",
  "שובר מתנה",
  "שווה כסף",
  "V-CHECK",
  "Colu",
  "Pay",
  "ניכוי במקור",
  "ניכוי חלק עובד טל״א",
  "ניכוי אחר",
] as const;

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currency}`;
}

export default function ReceiptFormClient({ 
  initial,
  footerText,
  editData,
  draftId,
}: { 
  initial: InitialReceiptCreateData;
  footerText?: string;
  editData?: {
    id: string;
    customerName: string;
    documentDate: string;
    total: number;
    currency: string;
    notes: string;
  } | null;
  draftId?: string;
}) {
  const inputBorderStyle = { borderColor: "var(--input-border)" };
  const digitalSignaturesEnabled = isDigitalSignaturesEnabledClient();
  // הגדרות קבלה (state)
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);
  
  // Date locking: minimum allowed date based on last issued receipt
  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["₪", "$", "€"]
  );
  const [currency, setCurrency] = useState<string>(initial.ok ? initial.settings.defaultCurrency : "₪");
  // Removed: vatType state

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [paymentErrors, setPaymentErrors] = useState<{ [key: number]: { method?: string; amount?: string } }>({});

  const [notes, setNotes] = useState("");
  const [emailNotes, setEmailNotes] = useState(""); // UI only - for future email feature

  // Refs for focus management
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const paymentsTableRef = useRef<HTMLDivElement>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: "", date: todayYmd(), amount: 0, currency },
  ]);

  const [busy, setBusy] = useState<null | "draft" | "issue" | "preview">(null);
  const [message, setMessage] = useState<string | null>(null);
  
  // Modal states
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Consent (computerized document) state
  const [recipientConsent, setRecipientConsent] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    hasConsent: boolean;
    recipientIdentifier: string | null;
    message?: string;
  }>({ status: "idle", hasConsent: false, recipientIdentifier: null });
  const [consentChecked, setConsentChecked] = useState(false);
  
  // Success modal data
  const [successModalData, setSuccessModalData] = useState<{
    documentId: string;
    documentNumber: string;
    companyName: string;
    language: "he" | "en";
  } | null>(null);
  
  // Preview state
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Check if sequence is locked, and show modal if not
  useEffect(() => {
    if (initial.ok && !initial.sequenceLocked && !draftId) {
      // First time creating receipt, need to set starting number
      setShowStartingNumberModal(true);
    }
  }, [initial, draftId]);

  // Load edit data if editing a draft
  useEffect(() => {
    if (editData) {
      setCustomerName(editData.customerName);
      setDocumentDate(editData.documentDate);
      setCurrency(editData.currency);
      setNotes(editData.notes);
      // Note: We don't have payment rows in the draft data structure yet
      // You may need to extend getDraftReceiptForEditAction to include them
    }
  }, [editData]);

  // Preview number comes from server (NOT allocated yet)
  const previewNumber = initial.ok ? initial.previewNumber : null;

  const total = useMemo(() => {
    const sum = payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0);
    if (!roundTotals) return sum;
    return Math.round(sum);
  }, [payments, roundTotals]);

  const payload: ReceiptDraftPayload = useMemo(() => {
    return {
      documentType: "receipt",
      customerName,
      customerId,
      documentDate,
      description,
      payments,
      notes,
      currency,
      total,
      roundTotals,
      language,
    };
  }, [customerName, customerId, documentDate, description, payments, notes, currency, total, roundTotals, language]);

  // Keep all payment rows in sync with selected document currency
  // Only sync if currency is NOT ₪ (ILS), because when it's ₪, each payment can have its own currency
  useEffect(() => {
    if (currency !== "₪") {
      setPayments((prev) => prev.map((p) => ({ ...p, currency })));
    }
  }, [currency]);

  if (!initial.ok) {
    return (
      <div className="p-4 border-2 border-red-200 rounded-xl bg-red-50">
        <div className="font-bold text-red-900 mb-2">שגיאה בטעינת הנתונים</div>
        <div className="text-red-700">{initial.message}</div>
      </div>
    );
  }

  // Display preview number in header
  const headerNumberText = previewNumber 
    ? `| ${previewNumber}` 
    : "| מספר יוקצה בעת הפקה";

  function addPaymentRow() {
    setPayments((prev) => [
      ...prev,
      { method: "", date: todayYmd(), amount: 0, currency },
    ]);
  }

  function updatePaymentRow(i: number, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removePaymentRow(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Helper function to focus field with error
  function focusFieldWithError(fieldRef: React.RefObject<HTMLElement | null>) {
    if (!fieldRef?.current) return;
    
    // Scroll to field
    fieldRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    
    // Add error highlight class
    fieldRef.current.classList.add("error-field");
    
    // Remove class after animation
    setTimeout(() => {
      fieldRef.current?.classList.remove("error-field");
    }, 3000);
  }

  // Handle Preview
  async function handlePreview() {
    // Basic validation
    if (!customerName || customerName.trim().length === 0) {
      toast.error("חובה למלא שם לקוח");
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      return;
    }
    
    if (!documentDate) {
      toast.error("חובה לבחור תאריך");
      return;
    }
    
    if (!payments || payments.length === 0) {
      toast.error("חובה להוסיף לפחות תקבול אחד");
      return;
    }
    
    // Open preview modal
    setPreviewModalOpen(true);
    setBusy("preview");
    setPreviewError(null);
    setPreviewPdfUrl(null);
    
    try {
      // Build payments array for preview (same format as getReceiptPreviewUrlAction)
      const paymentsForPreview = payments.map((p) => {
        const payment: any = {
          method: p.method || "תשלום",
          date: p.date || documentDate,
          amount: p.amount || 0,
          currency: p.currency || currency,
        };
        
        // Bank transfer fields (check both direct and metadata fields)
        if (p.bankName) payment.bankName = p.bankName;
        if (p.bankBranch || p.branch) payment.branch = p.bankBranch || p.branch;
        if (p.bankAccount || p.accountNumber) payment.accountNumber = p.bankAccount || p.accountNumber;
        
        // Credit card fields
        if (p.cardLastDigits) payment.cardLastDigits = p.cardLastDigits;
        if (p.cardType) payment.cardType = p.cardType;
        if (p.cardDealType) payment.cardDealType = p.cardDealType;
        if (p.cardInstallments) payment.cardInstallments = p.cardInstallments;
        
        // Check fields
        if (p.checkBank) payment.checkBank = p.checkBank;
        if (p.checkBranch) payment.checkBranch = p.checkBranch;
        if (p.checkAccount) payment.checkAccount = p.checkAccount;
        if (p.checkNumber) payment.checkNumber = p.checkNumber;
        
        // Digital wallet fields
        if (p.payerAccount) payment.payerAccount = p.payerAccount;
        if (p.transactionReference) payment.transactionReference = p.transactionReference;
        
        // Other fields
        if (p.description) payment.description = p.description;
        
        return payment;
      });
      
      // Build preview URL query params (matching PreviewClient expectations)
      const params = new URLSearchParams({
        previewNumber: previewNumber || "",
        customerName: customerName || "",
        customerId: customerId || "",
        documentDate: documentDate || todayYmd(),
        description: description || "",
        notes: notes || "",
        footerNotes: footerText || "",
        total: total.toString() || "0",
        currency: currency || "₪",
        payments: JSON.stringify(paymentsForPreview),
      });

      // If this receipt already exists as a draft/edit, include documentId so Preview can resolve company via documents.company_id (same as PDF)
      const docIdForPreview = draftId || (editData as any)?.id || null;
      if (docIdForPreview) {
        params.set("documentId", String(docIdForPreview));
      }
      
      const previewUrl = `/dashboard/documents/receipt/preview?${params.toString()}`;

      // Set the preview URL (will be loaded in iframe)
      setPreviewPdfUrl(previewUrl);
      setBusy(null);
    } catch (error: any) {
      setBusy(null);
      const errorMessage = error?.message || "שגיאה ביצירת תצוגה מקדימה";
      setPreviewError(errorMessage);
      toast.error(errorMessage);
    }
  }

  // Handle Save Draft
  async function handleSaveDraft() {
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});
    
    // Minimal validation - draft can be saved even if incomplete
    setBusy("draft");
    try {
      let result;
      if (draftId && editData) {
        // Update existing draft
        result = await updateReceiptDraftAction(draftId, payload);
      } else {
        // Create new draft
        result = await saveReceiptDraftAction(payload);
      }
      
      if (!result.ok) {
        toast.error(result.message || "שמירת טיוטה נכשלה");
        setBusy(null);
        return;
      }
      
      // Success! Show toast and redirect to documents list
      toast.success("הטיוטה נשמרה");
      setBusy(null);
      // Redirect to documents list after successful save
      window.location.href = "/dashboard/documents";
    } catch (error: any) {
      toast.error(error.message || "שמירת טיוטה נכשלה");
      setBusy(null);
    }
  }

  // Handle Issue Confirmation
  function handleIssueConfirmation() {
    // Open confirmation modal
    setConfirmationModalOpen(true);
  }

  // Load consent status when confirmation modal opens / customer changes
  useEffect(() => {
    let cancelled = false;
    async function loadConsent() {
      if (!confirmationModalOpen) return;
      if (!isDigitalSignaturesEnabledClient()) {
        // TEMP: digital signature + consent flow is deferred; do not call consent actions.
        setRecipientConsent({ status: "idle", hasConsent: true, recipientIdentifier: null });
        setConsentChecked(true);
        return;
      }
      setRecipientConsent((prev) => ({ ...prev, status: "loading", message: undefined }));
      try {
        const res = await getRecipientConsentStatusAction(customerId, customerName);
        if (cancelled) return;
        if (!res.ok) {
          setRecipientConsent({
            status: "error",
            hasConsent: false,
            recipientIdentifier: null,
            message: res.message,
          });
          setConsentChecked(false);
          return;
        }
        setRecipientConsent({
          status: "ready",
          hasConsent: res.hasConsent,
          recipientIdentifier: res.recipientIdentifier,
        });
        setConsentChecked(res.hasConsent);
      } catch (e: any) {
        if (cancelled) return;
        setRecipientConsent({
          status: "error",
          hasConsent: false,
          recipientIdentifier: null,
          message: e?.message || "שגיאה בטעינת סטטוס הסכמה",
        });
        setConsentChecked(false);
      }
    }
    loadConsent();
    return () => {
      cancelled = true;
    };
  }, [confirmationModalOpen, customerId, customerName]);

  // Handle Issue Confirm (after confirmation)
  async function handleIssueConfirm() {
    console.log("[FINALIZE_RECEIPT] handleIssueConfirm called", { 
      sequenceLocked, 
      customerName, 
      description: description?.substring(0, 20), 
      paymentsCount: payments.length 
    });
    
    setIsFinalizing(true);
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});
    
    // Prevent issue if sequence not locked
    if (!sequenceLocked) {
      console.log("[FINALIZE_RECEIPT] Validation failed: sequence not locked");
      toast.error("נדרש לבחור מספר התחלתי לפני הפקת מסמכים");
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      setShowStartingNumberModal(true);
      return;
    }
    
    // Full validation
    if (!customerName || customerName.trim().length === 0) {
      console.log("[FINALIZE_RECEIPT] Validation failed: customer name missing");
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }
    
    if (!description || description.trim().length < 5) {
      console.log("[FINALIZE_RECEIPT] Validation failed: description too short", { length: description?.length });
      setDescriptionError("התיאור חובה, לפחות 5 תווים");
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      // Scroll to the field after the modal closes (modal locks body scroll while open)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el =
            (descriptionInputRef.current as any) ||
            (typeof document !== "undefined" ? document.getElementById("description") : null);
          if (el && typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            if (typeof el.focus === "function") el.focus();
            if (typeof el.classList?.add === "function") {
              el.classList.add("error-field");
              setTimeout(() => {
                try {
                  el.classList.remove("error-field");
                } catch {}
              }, 3000);
            }
          }
        });
      });
      return;
    }
    
    // Validation: Check payment rows
    const errors: { [key: number]: { method?: string; amount?: string } } = {};
    payments.forEach((payment, i) => {
      const rowErrors: { method?: string; amount?: string } = {};
      if (!payment.method) {
        rowErrors.method = "יש לבחור אמצעי תשלום";
      } else if (!payment.amount || payment.amount <= 0) {
        rowErrors.amount = "סכום חייב להיות גדול מ-0";
      }
      if (Object.keys(rowErrors).length > 0) {
        errors[i] = rowErrors;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      console.log("[FINALIZE_RECEIPT] Validation failed: payment errors", { errorsCount: Object.keys(errors).length });
      setPaymentErrors(errors);
      focusFieldWithError(paymentsTableRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }
    
    console.log("[FINALIZE_RECEIPT] Validation passed, calling issueReceiptAction", { 
      payloadKeys: Object.keys(payload),
      customerName,
      description: description?.substring(0, 30),
      total,
      paymentsCount: payments.length
    });
    
    // TEMP: consent enforcement is deferred unless explicitly enabled
    if (isDigitalSignaturesEnabledClient()) {
      // Consent gate: require explicit recipient consent before issuance
      if (recipientConsent.status === "loading") {
        toast.error("טוען סטטוס הסכמה... נסה שוב בעוד רגע");
        setBusy(null);
        setIsFinalizing(false);
        return;
      }
      if (recipientConsent.status === "error") {
        toast.error(recipientConsent.message || "שגיאה בבדיקת הסכמה");
        setBusy(null);
        setIsFinalizing(false);
        return;
      }
      if (recipientConsent.status === "ready" && !recipientConsent.hasConsent) {
        if (!consentChecked) {
          toast.error("נדרש לסמן הסכמת מקבל למסמך ממוחשב לפני הפקה");
          setBusy(null);
          setIsFinalizing(false);
          return;
        }
        const consentResult = await giveRecipientConsentAction(customerId, customerName);
        if (!consentResult.ok) {
          toast.error(consentResult.message || "שגיאה בשמירת הסכמה");
          setBusy(null);
          setIsFinalizing(false);
          return;
        }
        setRecipientConsent((prev) => ({
          ...prev,
          hasConsent: true,
          recipientIdentifier: consentResult.recipientIdentifier,
        }));
      }
    }

    setBusy("issue");
    try {
      console.log("[FINALIZE_RECEIPT] Before API call - issueReceiptAction", {
        payloadKeys: Object.keys(payload),
        customerName: payload.customerName?.substring(0, 30),
        total: payload.total,
        paymentsCount: payload.payments?.length
      });
      
      const result = await issueReceiptAction(payload);      
      console.log("[FINALIZE_RECEIPT] After API call - issueReceiptAction result", { 
        ok: result.ok, 
        receiptId: result.receiptId, 
        documentNumber: result.documentNumber,
        message: result.message,
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : [],
        fullResult: JSON.stringify(result, null, 2)
      });
      
      if (!result || !result.ok) {
        const errorMessage = result?.message || "הפקת המסמך נכשלה - שגיאה לא ידועה";
        console.error("[FINALIZE_RECEIPT] API call failed", { 
          message: errorMessage,
          hasMessage: !!result?.message,
          resultKeys: result ? Object.keys(result) : [],
          resultType: typeof result,
          resultValue: result,
          fullResult: JSON.stringify(result, null, 2)
        });
        toast.error(errorMessage);
        setBusy(null);
        setIsFinalizing(false);
        // Keep modal open on error
        return;
      }
      
      console.log("[FINALIZE_RECEIPT] API call succeeded, showing success modal");
      // Success! Close confirmation modal
      setConfirmationModalOpen(false);
      setBusy(null);
      
      // Show success modal with receipt data
      setSuccessModalData({
        documentId: result.receiptId,
        documentNumber: result.documentNumber || "",
        companyName: result.companyName || "העסק שלי",
        language,
      });
      setSuccessModalOpen(true);
    } catch (error: any) {
      // Catch any exception from the server action call itself
      const errorMessage = error?.message || String(error) || "שגיאה לא ידועה";
      const errorType = error?.constructor?.name || typeof error;
      const errorStack = error?.stack || "No stack trace";
      
      console.error("[FINALIZE_RECEIPT] Exception in finalize flow", { 
        error: errorMessage,
        errorType,
        errorName: error?.name,
        errorCode: error?.code,
        stack: errorStack,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      });
      toast.error(`שגיאה בהפקת המסמך: ${errorMessage}`);
      setBusy(null);
      setIsFinalizing(false);
      // Keep modal open on error
      return;
    } finally {
      console.log("[FINALIZE_RECEIPT] Finalize flow completed (finally block)");
      setIsFinalizing(false);
    }
  }


  return (
    <main dir="rtl" className="min-h-screen" style={{ backgroundColor: '#EDF1F5' }}>
      <style>{`
        /* Typography styles for receipt page only - scoped to this page */
        main[dir="rtl"] .ui-container p {
          font-size: 18px !important;
        }
        main[dir="rtl"] .ui-container h2 {
          font-size: 26px !important;
        }
        main[dir="rtl"] .ui-container h1 {
          font-size: 56px !important;
          font-weight: 700 !important;
        }
        /* Set font size to 18px for all text elements except h1 and h2 */
        main[dir="rtl"] .ui-container button:not([style*="font-size"]),
        main[dir="rtl"] .ui-container input:not([style*="font-size"]),
        main[dir="rtl"] .ui-container select:not([style*="font-size"]),
        main[dir="rtl"] .ui-container textarea:not([style*="font-size"]),
        main[dir="rtl"] .ui-container label,
        main[dir="rtl"] .ui-container span:not([style*="font-size"]),
        main[dir="rtl"] .ui-container div:not([style*="font-size"]):not([class*="text-"]):not([class*="font-"]),
        main[dir="rtl"] .ui-container p {
          font-size: 18px !important;
        }
        /* Ensure h1 and h2 keep their sizes */
        main[dir="rtl"] .ui-container h1 {
          font-size: 56px !important;
          font-weight: 700 !important;
        }
        main[dir="rtl"] .ui-container h2 {
          font-size: 26px !important;
        }
      `}</style>

      <div className="w-full pt-2 px-4 sm:px-6 lg:px-8">
        <div
          className="ui-container"
          style={{
            maxWidth: "1100px",
            paddingLeft: 0,
            paddingRight: 0,
          }}
        >
        {/* Message Alert - Yellow background section - moved to top */}
        {message && (
          <Card className={cn(
            "mb-[50px]",
            message.includes("שגיאה") ? "border-danger bg-danger/10" : "border-success bg-success/10"
          )}>
            <CardContent className="p-4">
              <div className={cn(
                "flex items-center gap-3 font-medium",
                message.includes("שגיאה") ? "text-danger" : "text-success"
              )}>
                {message.includes("שגיאה") && "⚠️"}
                {!message.includes("שגיאה") && "✓"}
                <span>{message}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Receipt Settings Summary - moved above H1 */}
        <ReceiptSettingsSummary
          settings={{
            currency,
            language,
            vatType: "", // Required by interface but not used
            roundTotals,
            allowedCurrencies,
            allowedLanguages: [
              { value: "he", label: "עברית" },
              { value: "en", label: "English" },
            ],
            canEdit: {
              currency: true,
              language: true,
              roundTotals: true,
            },
          }}
          onChange={(patch) => {
            if (patch.currency !== undefined) setCurrency(patch.currency);
            if (patch.language !== undefined) setLanguage(patch.language as "he" | "en");
            if (patch.roundTotals !== undefined) setRoundTotals(patch.roundTotals);
          }}
        />

        {/* Page Header - Title */}
        <div className="mb-[50px]">
          <div className="flex justify-between items-center">
            <h1 className="text-right">
              קבלה {previewNumber || '---'}
            </h1>
          </div>
          {initial.companyName && (
            <h2 className="text-right mt-[10px] mb-[40px]">{initial.companyName}</h2>
          )}
        </div>

      {/* Form Sections */}
      <form className="ui-section-gap">
        {/* Customer Details */}
        <FormSection 
          title="פרטי לקוח"
          description="בחר לקוח קיים או הזן שם חדש"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-[50px]">
          <FieldWrapper 
            label="שם לקוח" 
            required 
            error={customerNameError}
            id="customerName"
            className="min-w-0"
          >
            <div ref={customerNameRef}>
              <CustomerAutocomplete
                value={customerName}
                onChange={(value) => {
                  setCustomerName(value);
                  if (customerNameError && value.trim().length > 0) {
                    setCustomerNameError(null);
                  }
                }}
                onSelectCustomer={(customer) => {
                  if (customer) {
                    setCustomerId(customer.id);
                    setCustomerNameError(null);
                  }
                }}
                onAddNewCustomer={() => setShowQuickAddModal(true)}
                placeholder="התחל להקליד שם לקוח..."
              />
            </div>
          </FieldWrapper>

          <FieldWrapper 
            label="תאריך מסמך" 
            required 
            id="documentDate"
            className="min-w-0"
          >
            <DateInput
              id="documentDate"
              value={documentDate}
              onChange={(value) => {
                // Ensure date is not before minAllowedDate
                if (minAllowedDate && value < minAllowedDate) {
                  setDocumentDate(minAllowedDate)
                } else {
                  setDocumentDate(value)
                }
              }}
              min={minAllowedDate || undefined}
              aria-required="true"
              style={inputBorderStyle}
            />
          </FieldWrapper>
          </div>
        </FormSection>

        {/* Document Details */}
        <FormSection 
          title="פרטי המסמך"
          description="תיאור התשלום או השירות"
        >
        <FieldWrapper 
          label="תיאור" 
          required 
          error={descriptionError}
          id="description"
          hint="מינימום 5 תווים - לדוגמה: שירותי עיצוב גרפי"
          className="ui-field-wide"
        >
          <Input
            id="description"
            ref={descriptionInputRef}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (descriptionError && e.target.value.trim().length >= 5) {
                setDescriptionError(null);
              }
            }}
            placeholder="הזן תיאור..."
            className={descriptionError ? "border-danger" : ""}
            aria-required="true"
            aria-invalid={!!descriptionError}
            aria-describedby={descriptionError ? "description-error" : "description-hint"}
            style={inputBorderStyle}
          />
        </FieldWrapper>
        </FormSection>

        {/* Payments Section */}
        <FormSection 
          title="פירוט תקבולים"
          description="איך שילמו לך? אפשר לבחור מספר צורות תשלום שונות"
        >
          <div ref={paymentsTableRef} className="space-y-[50px]">
            {Object.keys(paymentErrors).length > 0 && (
              <div 
                style={{ 
                  backgroundColor: '#FEF2F2', 
                  border: '1px solid #9B0003',
                  borderRadius: '8px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#9B0003' }}>
                    יש לתקן את השדות המסומנים באדום
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-[50px]">
              {payments.map((row, i) => (
                <div key={i} className="relative" style={{ 
                  backgroundColor: 'white', 
                  borderRadius: '20px', 
                  boxShadow: '0 0 13px 0 rgba(0, 0, 0, 0.10)', 
                  border: 'none',
                  paddingTop: '30px',
                  paddingBottom: '30px',
                  paddingLeft: '50px',
                  paddingRight: '30px',
                }}>
                  {/* Delete Button - Icon Only, Absolutely Positioned */}
                  {payments.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePaymentRow(i)}
                      aria-label="מחיקה"
                      className="absolute top-3 left-3 text-danger hover:text-danger hover:bg-danger/10"
                      title="מחק"
                      style={{ color: '#9B0003' }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  <div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-[50px]">
                  <FieldWrapper 
                    label="אמצעי תשלום" 
                    required
                    error={paymentErrors[i]?.method}
                    id={`payment-method-${i}`}
                    className="min-w-0"
                  >
                    <Select
                      value={row.method}
                      onValueChange={(v) => {
                        updatePaymentRow(i, { method: v as any });
                        if (paymentErrors[i]?.method) {
                          const newErrors = { ...paymentErrors };
                          if (newErrors[i]) {
                            delete newErrors[i].method;
                            if (Object.keys(newErrors[i]).length === 0) {
                              delete newErrors[i];
                            }
                          }
                          setPaymentErrors(newErrors);
                        }
                      }}
                    >
                      <SelectTrigger 
                        id={`payment-method-${i}`}
                        className={cn("ui-dd-trigger", paymentErrors[i]?.method ? "border-danger" : "")}
                        aria-required="true"
                        aria-invalid={!!paymentErrors[i]?.method}
                        aria-describedby={paymentErrors[i]?.method ? `payment-method-${i}-error` : undefined}
                      >
                        <SelectValue placeholder="בחר אמצעי תשלום..." />
                      </SelectTrigger>
                      <SelectContent className="ui-dd-content" {...({ dir: "rtl" } as any)} align="end">
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m} className="ui-dd-item ui-dd-item-rtl">
                            <span className="ui-dd-item-label">{m}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>

                  <FieldWrapper label="תאריך תשלום" required id={`payment-date-${i}`} className="min-w-0">
                    <DateInput
                      id={`payment-date-${i}`}
                      value={row.date}
                      onChange={(value) => updatePaymentRow(i, { date: value })}
                      aria-required="true"
                    style={inputBorderStyle}
                    />
                  </FieldWrapper>

                  <FieldWrapper 
                    label="סכום" 
                    required
                    error={paymentErrors[i]?.amount}
                    id={`payment-amount-${i}`}
                    className="min-w-0"
                  >
                    <CurrencyAmountGroup
                      currencyControl={
                        <Select
                        value={row.currency || currency}
                        disabled={currency !== "₪"}
                        onValueChange={(v) => updatePaymentRow(i, { currency: v })}
                        >
                          <SelectTrigger className="ui-dd-trigger" aria-label="מטבע">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="ui-dd-content" {...({ dir: "rtl" } as any)} align="end">
                          {allowedCurrencies.map((c) => (
                            <SelectItem key={c} value={c} className="ui-dd-item ui-dd-item-rtl">
                              <span className="ui-dd-item-label">{c}</span>
                            </SelectItem>
                          ))}
                          </SelectContent>
                        </Select>
                      }
                      amountControl={
                        <MoneyInput
                          id={`payment-amount-${i}`}
                          value={row.amount}
                          onChange={(v) => {
                            updatePaymentRow(i, { amount: v });
                            if (paymentErrors[i]?.amount && v > 0) {
                              const newErrors = { ...paymentErrors };
                              if (newErrors[i]) {
                                delete newErrors[i].amount;
                                if (Object.keys(newErrors[i]).length === 0) {
                                  delete newErrors[i];
                                }
                              }
                              setPaymentErrors(newErrors);
                            }
                          }}
                        currency={currency}
                          error={!!paymentErrors[i]?.amount}
                          style={{ 
                            fontSize: '18px',
                            fontWeight: 600,
                            borderColor: "var(--input-border)",
                          }}
                          aria-required={true}
                          aria-invalid={!!paymentErrors[i]?.amount}
                          aria-describedby={paymentErrors[i]?.amount ? `payment-amount-${i}-error` : undefined}
                        />
                      }
                    />
                  </FieldWrapper>
                    </div>

                    <div className="mt-[50px]">
                      <PaymentDetailsSection
                        payment={row}
                        onUpdate={(updates) => updatePaymentRow(i, updates)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPaymentRow}
              className="mt-[50px]"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '18px',
                color: '#19183B',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                fontWeight: 500,
              }}
            >
              הוספת תקבול
            </button>

            <div className="pt-[50px] mt-[50px] border-t" style={{ borderColor: '#EDF1F5' }}>
              <div className="flex justify-between items-center">
                <div className="text-lg font-bold" style={{ color: '#19183B' }}>סה״כ שולם</div>
                <div className="text-2xl font-bold" style={{ color: '#19183B' }}>{formatMoney(total, currency)}</div>
              </div>
              {roundTotals && (
                <p className="text-xs mt-2 text-right" style={{ color: '#19183B', opacity: 0.8 }}>כולל עיגול לסכום סופי</p>
              )}
            </div>
          </div>
        </FormSection>

        {/* Notes Section */}
        <FormSection 
          title="הערות"
        >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FieldWrapper 
            label="הערות שיופיעו במסמך" 
            id="notes"
            className="min-w-0"
          >
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="חשוב לדעת..."
              className="min-h-[100px] resize-y"
              aria-describedby="notes-hint"
            />
          </FieldWrapper>
          <FieldWrapper 
            label="הערות שיופיעו בגוף המייל" 
            id="emailNotes"
            className="min-w-0"
          >
            <Textarea
              id="emailNotes"
              value={emailNotes}
              onChange={(e) => setEmailNotes(e.target.value)}
              placeholder="חשוב לדעת..."
              className="min-h-[100px] resize-y"
            />
          </FieldWrapper>
        </div>
        </FormSection>

        {/* Action Buttons - 3 buttons only */}
        <div className="mt-10 flex gap-4 justify-end">
          {/* תצוגה מקדימה */}
          <Button
            variant="ghost"
            onClick={handlePreview}
            disabled={busy != null || !sequenceLocked}
            loading={busy === "preview"}
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            תצוגה מקדימה
          </Button>
          
          {/* שמירת טיוטה */}
          <Button
            variant="secondary"
            onClick={handleSaveDraft}
            disabled={busy != null}
            loading={busy === "draft"}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            שמירת טיוטה
          </Button>
          
          {/* הפקת מסמך */}
          <Button
            variant="primary"
            onClick={handleIssueConfirmation}
            disabled={busy != null || !sequenceLocked}
            loading={busy === "issue"}
            className="flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            הפקת מסמך
          </Button>
        </div>
      </form>

        {/* Message Alert */}
        {message && (
          <Card className={cn(
            "mt-[50px]",
            message.includes("שגיאה") ? "border-danger bg-danger/10" : "border-success bg-success/10"
          )}>
            <CardContent className="p-4">
              <div className={cn(
                "flex items-center gap-3 font-medium",
                message.includes("שגיאה") ? "text-danger" : "text-success"
              )}>
                {message.includes("שגיאה") && "⚠️"}
                {!message.includes("שגיאה") && "✓"}
                <span>{message}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer Text from Admin Settings - REMOVED (blue section) */}

        {/* Quick Add Customer Modal */}
      <QuickAddCustomerModal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        onCustomerCreated={(customer) => {
          setCustomerName(customer.name);
          setCustomerId(customer.id);
          setMessage(`הלקוח "${customer.name}" נוסף בהצלחה ללקוחות שמורים`);
          setTimeout(() => setMessage(null), 3000);
        }}
        onSaveNameOnly={(name) => {
          setCustomerName(name);
          setCustomerId(null);
          setMessage("שם הלקוח נשמר למסמך זה בלבד (לא נוסף ללקוחות)");
          setTimeout(() => setMessage(null), 3000);
        }}
        prefillName={customerName}
      />

      {/* Starting Number Modal - Opens on first receipt creation */}
      {showStartingNumberModal && (
        <StartingNumberModal
          documentType="receipt"
          onClose={() => {
            // User cancelled - redirect back to documents list
            window.location.href = "/dashboard/documents";
          }}
          onSuccess={() => {
            // Sequence is now locked, refresh page to get new sequence info
            setShowStartingNumberModal(false);
            setSequenceLocked(true);
            window.location.reload();
          }}
        />
      )}

      {/* Preview Modal */}
      <ReceiptPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        pdfUrl={previewPdfUrl || undefined}
        isLoading={busy === "preview"}
        error={previewError}
      />

      {/* Confirmation Modal */}
      <ReceiptConfirmationModal
        isOpen={confirmationModalOpen}
        onClose={() => {
          console.log("[FINALIZE_RECEIPT] onClose called", { isFinalizing });
          if (isFinalizing) {
            console.log("[FINALIZE_RECEIPT] Blocking close - finalization in progress");
            return; // Prevent closing during finalization
          }
          setConfirmationModalOpen(false);
        }}
        onConfirm={handleIssueConfirm}
        documentDate={documentDate}
        customerName={customerName}
        total={total}
        currency={currency}
        isLoading={busy === "issue" || isFinalizing}
        hasEmail={false} // TODO: Check if email exists
        isFinalizing={isFinalizing}
        consentState={digitalSignaturesEnabled ? recipientConsent : undefined}
        consentChecked={digitalSignaturesEnabled ? consentChecked : undefined}
        onConsentCheckedChange={digitalSignaturesEnabled ? setConsentChecked : undefined}
        onRevokeConsent={
          digitalSignaturesEnabled
            ? async () => {
                const res = await revokeRecipientConsentAction(customerId, customerName);
                if (!res.ok) {
                  toast.error(res.message || "שגיאה בביטול הסכמה");
                  return;
                }
                setRecipientConsent((prev) => ({ ...prev, hasConsent: false }));
                setConsentChecked(false);
                toast.success("ההסכמה בוטלה");
              }
            : undefined
        }
      />

      {/* Success Modal */}
      {successModalData && (
        <ReceiptSuccessModal
          isOpen={successModalOpen}
          onClose={() => {
            // Redirect to Dashboard instead of staying on receipt edit page
            window.location.href = "/dashboard";
          }}
          documentNumber={successModalData.documentNumber}
          companyName={successModalData.companyName}
          documentId={successModalData.documentId}
          baseLanguage={successModalData.language}
          onViewDocument={async () => {
            try {
              window.location.href = `/dashboard/documents/receipt/${successModalData.documentId}/summary`;
            } catch (error: any) {
              toast.error(`שגיאה בפתיחת תצוגת המסמך: ${error.message}`);
            }
          }}
          onDownloadHebrew={async (opts) => {
            try {
              const issue = opts?.issue || "copy";
              const pdfUrl = `/api/documents/${successModalData.documentId}/pdf?lang=he&issue=${issue}`;
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
              link.download = `receipt-${successModalData.documentNumber || successModalData.documentId}-he-${issue}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(downloadUrl);
            } catch (error: any) {
              toast.error(`שגיאה בהורדת PDF: ${error.message}`);
            }
          }}
          onDownloadEnglish={async (opts) => {
            try {
              const issue = opts?.issue || "copy";
              const pdfUrl = `/api/documents/${successModalData.documentId}/pdf?lang=en&issue=${issue}`;
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
              link.download = `receipt-${successModalData.documentNumber || successModalData.documentId}-en-${issue}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(downloadUrl);
            } catch (error: any) {
              toast.error(`שגיאה בהורדת PDF: ${error.message}`);
            }
          }}
        />
      )}
        </div>
      </div>
    </main>
  );
}
