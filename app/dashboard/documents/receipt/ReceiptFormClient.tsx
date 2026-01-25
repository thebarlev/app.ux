"use client";

import { useMemo, useState, useEffect, useRef } from "react";
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
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import ReceiptPreviewModal from "@/components/documents/ReceiptPreviewModal";
import ReceiptConfirmationModal from "@/components/documents/ReceiptConfirmationModal";
import ReceiptSuccessModal from "@/components/documents/ReceiptSuccessModal";
import PaymentDetailsSection from "./PaymentDetailsSection";
import ReceiptSettingsSummary from "@/components/documents/receipt/ReceiptSettingsSummary";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { FloatingInput } from "@/components/ui/floating-input";
import { FloatingTextarea } from "@/components/ui/floating-textarea";
import { FloatingDateInput } from "@/components/ui/floating-date-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyAmountGroup } from "@/components/ui/currency-amount-group";
import { Card, CardContent } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { cn } from "@/lib/utils";
import { isDigitalSignaturesEnabledClient } from "@/lib/documents/signing/feature-flags-client";
import { Trash2, Save, CheckCircle, Eye } from "lucide-react";
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
  const digitalSignaturesEnabled = isDigitalSignaturesEnabledClient();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);

  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["₪", "$", "€"]
  );
  const [currency, setCurrency] = useState<string>(initial.ok ? initial.settings.defaultCurrency : "₪");

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [paymentErrors, setPaymentErrors] = useState<{ [key: number]: { method?: string; amount?: string } }>({});

  const [notes, setNotes] = useState("");
  const [emailNotes, setEmailNotes] = useState("");

  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const paymentsTableRef = useRef<HTMLDivElement>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "", date: todayYmd(), amount: 0, currency }]);

  const [busy, setBusy] = useState<null | "draft" | "issue" | "preview">(null);
  const [message, setMessage] = useState<string | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const [recipientConsent, setRecipientConsent] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    hasConsent: boolean;
    recipientIdentifier: string | null;
    message?: string;
  }>({ status: "idle", hasConsent: false, recipientIdentifier: null });
  const [consentChecked, setConsentChecked] = useState(false);

  const [successModalData, setSuccessModalData] = useState<{
    documentId: string;
    documentNumber: string;
    companyName: string;
    documentTypeLabel: string;
    language: "he" | "en";
  } | null>(null);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (initial.ok && !initial.sequenceLocked && !draftId) {
      setShowStartingNumberModal(true);
    }
  }, [initial, draftId]);

  useEffect(() => {
    if (editData) {
      setCustomerName(editData.customerName);
      setDocumentDate(editData.documentDate);
      setCurrency(editData.currency);
      setNotes(editData.notes);
    }
  }, [editData]);

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

  function addPaymentRow() {
    setPayments((prev) => [...prev, { method: "", date: todayYmd(), amount: 0, currency }]);
  }

  function updatePaymentRow(i: number, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removePaymentRow(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function focusFieldWithError(fieldRef: React.RefObject<HTMLElement | null>) {
    if (!fieldRef?.current) return;
    fieldRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    fieldRef.current.classList.add("error-field");
    setTimeout(() => fieldRef.current?.classList.remove("error-field"), 3000);
  }

  async function handlePreview() {
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

    setPreviewModalOpen(true);
    setBusy("preview");
    setPreviewError(null);
    setPreviewPdfUrl(null);

    try {
      const paymentsForPreview = payments.map((p) => {
        const payment: any = {
          method: p.method || "תשלום",
          date: p.date || documentDate,
          amount: p.amount || 0,
          currency: p.currency || currency,
        };

        if (p.bankName) payment.bankName = p.bankName;
        if (p.bankBranch || p.branch) payment.branch = p.bankBranch || p.branch;
        if (p.bankAccount || p.accountNumber) payment.accountNumber = p.bankAccount || p.accountNumber;

        if (p.cardLastDigits) payment.cardLastDigits = p.cardLastDigits;
        if (p.cardType) payment.cardType = p.cardType;
        if (p.cardDealType) payment.cardDealType = p.cardDealType;
        if (p.cardInstallments) payment.cardInstallments = p.cardInstallments;

        if (p.checkBank) payment.checkBank = p.checkBank;
        if (p.checkBranch) payment.checkBranch = p.checkBranch;
        if (p.checkAccount) payment.checkAccount = p.checkAccount;
        if (p.checkNumber) payment.checkNumber = p.checkNumber;

        if (p.payerAccount) payment.payerAccount = p.payerAccount;
        if (p.transactionReference) payment.transactionReference = p.transactionReference;

        if (p.description) payment.description = p.description;

        return payment;
      });

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

      const docIdForPreview = draftId || (editData as any)?.id || null;
      if (docIdForPreview) params.set("documentId", String(docIdForPreview));

      setPreviewPdfUrl(`/dashboard/documents/receipt/preview?${params.toString()}`);
      setBusy(null);
    } catch (error: any) {
      setBusy(null);
      const errorMessage = error?.message || "שגיאה ביצירת תצוגה מקדימה";
      setPreviewError(errorMessage);
      toast.error(errorMessage);
    }
  }

  async function handleSaveDraft() {
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});

    setBusy("draft");
    try {
      let result;
      if (draftId && editData) result = await updateReceiptDraftAction(draftId, payload);
      else result = await saveReceiptDraftAction(payload);

      if (!result.ok) {
        toast.error(result.message || "שמירת טיוטה נכשלה");
        setBusy(null);
        return;
      }

      toast.success("הטיוטה נשמרה");
      setBusy(null);
      window.location.href = "/dashboard/documents";
    } catch (error: any) {
      toast.error(error.message || "שמירת טיוטה נכשלה");
      setBusy(null);
    }
  }

  function handleIssueConfirmation() {
    setConfirmationModalOpen(true);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadConsent() {
      if (!confirmationModalOpen) return;

      if (!isDigitalSignaturesEnabledClient()) {
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

  async function handleIssueConfirm() {
    setIsFinalizing(true);
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});

    if (!sequenceLocked) {
      toast.error("נדרש לבחור מספר התחלתי לפני הפקת מסמכים");
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      setShowStartingNumberModal(true);
      return;
    }

    if (!customerName || customerName.trim().length === 0) {
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    if (!description || description.trim().length < 5) {
      setDescriptionError("התיאור חובה, לפחות 5 תווים");
      setIsFinalizing(false);
      setConfirmationModalOpen(false);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el =
            (descriptionInputRef.current as any) ||
            (typeof document !== "undefined" ? document.getElementById("description") : null);
          if (el?.scrollIntoView) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus?.();
            el.classList?.add?.("error-field");
            setTimeout(() => el.classList?.remove?.("error-field"), 3000);
          }
        });
      });
      return;
    }

    const errors: { [key: number]: { method?: string; amount?: string } } = {};
    payments.forEach((payment, i) => {
      const rowErrors: { method?: string; amount?: string } = {};
      if (!payment.method) rowErrors.method = "יש לבחור אמצעי תשלום";
      else if (!payment.amount || payment.amount <= 0) rowErrors.amount = "סכום חייב להיות גדול מ-0";
      if (Object.keys(rowErrors).length > 0) errors[i] = rowErrors;
    });

    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      focusFieldWithError(paymentsTableRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    if (isDigitalSignaturesEnabledClient()) {
      if (recipientConsent.status === "loading") {
        toast.error("טוען סטטוס הסכמה... נסה שוב בעוד רגע");
        setIsFinalizing(false);
        return;
      }
      if (recipientConsent.status === "error") {
        toast.error(recipientConsent.message || "שגיאה בבדיקת הסכמה");
        setIsFinalizing(false);
        return;
      }
      if (recipientConsent.status === "ready" && !recipientConsent.hasConsent) {
        if (!consentChecked) {
          toast.error("נדרש לסמן הסכמת מקבל למסמך ממוחשב לפני הפקה");
          setIsFinalizing(false);
          return;
        }
        const consentResult = await giveRecipientConsentAction(customerId, customerName);
        if (!consentResult.ok) {
          toast.error(consentResult.message || "שגיאה בשמירת הסכמה");
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
      const result = await issueReceiptAction(payload);

      if (!result || !result.ok) {
        toast.error(result?.message || "הפקת המסמך נכשלה - שגיאה לא ידועה");
        setBusy(null);
        setIsFinalizing(false);
        return;
      }

      setConfirmationModalOpen(false);
      setBusy(null);

      setSuccessModalData({
        documentId: result.receiptId,
        documentNumber: result.documentNumber || "",
        companyName: result.companyName || "העסק שלי",
        documentTypeLabel: "קבלה",
        language,
      });
      setSuccessModalOpen(true);
    } catch (error: any) {
      toast.error(`שגיאה בהפקת המסמך: ${error?.message || String(error) || "שגיאה לא ידועה"}`);
      setBusy(null);
      setIsFinalizing(false);
      return;
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen">
      <style>{`
        main[dir="rtl"] .ui-container p { font-size: 18px !important; }
        main[dir="rtl"] .ui-container h2 { font-size: 26px !important; }
        main[dir="rtl"] .ui-container h1 { font-size: 56px !important; font-weight: 700 !important; }
        main[dir="rtl"] .ui-container button:not([style*="font-size"]),
        main[dir="rtl"] .ui-container input:not([style*="font-size"]),
        main[dir="rtl"] .ui-container select:not([style*="font-size"]),
        main[dir="rtl"] .ui-container textarea:not([style*="font-size"]),
        main[dir="rtl"] .ui-container label:not(.ui-floating-label):not(.ui-date-label):not(.ui-select-label):not([style*="font-size"]),
        main[dir="rtl"] .ui-container span:not([style*="font-size"]),
        main[dir="rtl"] .ui-container div:not([style*="font-size"]):not([class*="text-"]):not([class*="font-"]),
        main[dir="rtl"] .ui-container p { font-size: 18px !important; }
        main[dir="rtl"] .ui-container h1 { font-size: 56px !important; font-weight: 700 !important; }
        main[dir="rtl"] .ui-container h2 { font-size: 26px !important; }
      `}</style>

      <div className="w-full pt-2 px-4 sm:px-6 lg:px-8">
        <div className="ui-container" style={{ paddingLeft: 0, paddingRight: 0 }}>
          {message && (
            <Card
              className={cn(
                "mb-[50px]",
                message.includes("שגיאה") ? "border-danger bg-danger/10" : "border-success bg-success/10"
              )}
            >
              <CardContent className="p-4">
                <div
                  className={cn(
                    "flex items-center gap-3 font-medium",
                    message.includes("שגיאה") ? "text-danger" : "text-success"
                  )}
                >
                  {message.includes("שגיאה") && "⚠️"}
                  {!message.includes("שגיאה") && "✓"}
                  <span>{message}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <ReceiptSettingsSummary
            settings={{
              currency,
              language,
              vatType: "",
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

          <div className="mb-[50px]">
            <div className="flex justify-between items-center">
              <h1 className="text-right">קבלה {previewNumber || "---"}</h1>
            </div>
            {initial.companyName && <h2 className="text-right mt-[10px] mb-[40px]">{initial.companyName}</h2>}
          </div>

          <form className="ui-section-gap">
            <FormSection title="פרטי לקוח" description="">
              <div
                className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px]  border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]"
              >
                          <div
                            className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]"
                            data-payment-primary-grid="true"
                          >
                  <div ref={customerNameRef}>
                    <CustomerAutocomplete
                      id="customerName"
                      label="שם לקוח"
                      required
                      error={customerNameError}
                      value={customerName}
                      onChange={(value) => {
                        setCustomerName(value);
                        if (customerNameError && value.trim().length > 0) setCustomerNameError(null);
                      }}
                      onSelectCustomer={(customer) => {
                        if (customer) {
                          setCustomerId(customer.id);
                          setCustomerNameError(null);
                        }
                      }}
                      onAddNewCustomer={() => setShowQuickAddModal(true)}
                      placeholder="התחל להקליד שם לקוח..."
                      containerClassName="w-full min-w-0"
                    />
                  </div>

                  <FloatingDateInput
                    label="תאריך מסמך"
                    required
                    id="documentDate"
                    value={documentDate}
                    onChange={(value) => {
                      if (minAllowedDate && value < minAllowedDate) setDocumentDate(minAllowedDate);
                      else setDocumentDate(value);
                    }}
                    min={minAllowedDate || undefined}
                    containerClassName="w-full min-w-0 ui-document-date-offset"
                  />
                </div>
              </div>
            </FormSection>

            <FormSection title="פרטי המסמך" description="">
              <div
                className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]"
              >
                <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                  <div className="ui-field-wide w-full min-w-0">
                    <div className="w-1/2">
                      <FloatingInput
                        label="תיאור"
                        required
                        error={descriptionError}
                        id="description"
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          if (descriptionError && e.target.value.trim().length >= 5) setDescriptionError(null);
                        }}
                        helperText="מינימום 5 תווים - לדוגמה: שירותי עיצוב גרפי"
                        containerClassName="w-full min-w-0"
                        {...({ ref: descriptionInputRef } as any)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </FormSection>

            {/* Payments Section (UPDATED LAYOUT) */}
            <FormSection title="פירוט תקבולים" description="">
              <div ref={paymentsTableRef} className="space-y-[10px]">
                {Object.keys(paymentErrors).length > 0 && (
                  <div
                    style={{
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #9B0003",
                      borderRadius: "8px",
                      padding: "16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "20px" }}>⚠️</span>
                      <span style={{ fontSize: "16px", fontWeight: 600, color: "#9B0003" }}>
                        יש לתקן את השדות המסומנים באדום
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-[20px]">
                  {payments.map((row, i) => (
                    <div key={i}>
                      <div
                        className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6"
                        style={{
                          backgroundColor: "white",
                          border: "none",
                        }}
                        data-payment-card="true"
                      >
                      {payments.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePaymentRow(i)}
                          aria-label="מחיקה"
                          className="absolute top-3 left-3 text-danger hover:text-danger hover:bg-danger/10"
                          title="מחק"
                          style={{ color: "#9B0003" }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}

                      <div className="min-w-0">
                        {/* Grid דינמי: כמה שיותר בשורה אחת, נשבר יפה */}
                      <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                          <div className="w-full min-w-0">
                            <label
                              htmlFor={`payment-method-${i}`}
                              className="ui-select-label block text-right text-[length:var(--field-label-size)] text-[color:var(--field-label)] leading-none"
                            >
                              אמצעי תשלום<span className="ms-1">*</span>
                            </label>
                            <Select
                              value={row.method}
                              onValueChange={(v) => {
                                updatePaymentRow(i, { method: v as any });
                                if (paymentErrors[i]?.method) {
                                  const newErrors = { ...paymentErrors };
                                  if (newErrors[i]) {
                                    delete newErrors[i].method;
                                    if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                  }
                                  setPaymentErrors(newErrors);
                                }
                              }}
                            >
                              <SelectTrigger
                                id={`payment-method-${i}`}
                                variant="underline"
                                className={cn(
                                  "w-full min-w-0",
                                  paymentErrors[i]?.method ? "border-danger focus:border-danger" : ""
                                )}
                                aria-required="true"
                                aria-invalid={!!paymentErrors[i]?.method}
                                aria-describedby={paymentErrors[i]?.method ? `payment-method-${i}-error` : undefined}
                              >
                                <SelectValue placeholder="בחר אמצעי תשלום..." />
                              </SelectTrigger>

                              <SelectContent>
                                {PAYMENT_METHODS.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <FloatingDateInput
                            label="תאריך תשלום"
                            required
                            id={`payment-date-${i}`}
                            value={row.date}
                            onChange={(value) => updatePaymentRow(i, { date: value })}
                            containerClassName="w-full min-w-0"
                          />

                          <FieldWrapper
                            label="סכום"
                            required
                            error={paymentErrors[i]?.amount}
                            id={`payment-amount-${i}`}
                            className="w-full min-w-0 ui-money-block"
                            labelClassName="ui-money-label"
                          >
                            {/* עטיפה כדי להבטיח min-w-0 + w-full */}
                            <div className="min-w-0 w-full">
                              <CurrencyAmountGroup
                                currencyControl={
                                  <div className="shrink-0">
                                    <Select
                                      value={row.currency || currency}
                                      disabled={currency !== "₪"}
                                      onValueChange={(v) => updatePaymentRow(i, { currency: v })}
                                    >
                                      <SelectTrigger
                                        variant="underline"
                                        className="w-[72px] shrink-0"
                                        style={{ fontSize: "18px", fontWeight: 600 }}
                                        aria-label="מטבע"
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {allowedCurrencies.map((c) => (
                                          <SelectItem key={c} value={c}>
                                            {c}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                }
                                amountControl={
                                  <div className="min-w-0 w-full">
                                    <MoneyInput  className="w-full min-w-0"
                                      id={`payment-amount-${i}`}
                                      value={row.amount}
                                      onChange={(v) => {
                                        updatePaymentRow(i, { amount: v });
                                        if (paymentErrors[i]?.amount && v > 0) {
                                          const newErrors = { ...paymentErrors };
                                          if (newErrors[i]) {
                                            delete newErrors[i].amount;
                                            if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                          }
                                          setPaymentErrors(newErrors);
                                        }
                                      }}
                                      currency={currency}
                                      error={!!paymentErrors[i]?.amount}
                                      style={{ fontSize: "18px", fontWeight: 600 }}
                                      aria-required={true}
                                      aria-invalid={!!paymentErrors[i]?.amount}
                                      aria-describedby={paymentErrors[i]?.amount ? `payment-amount-${i}-error` : undefined}
                                    />
                                  </div>
                                }
                              />
                            </div>
                          </FieldWrapper>
                        </div>

                        <div className="mt-[50px] min-w-0">
                          <PaymentDetailsSection payment={row} onUpdate={(updates) => updatePaymentRow(i, updates)} />
                        </div>
                      </div>
                      </div>
                      {i < payments.length - 1 ? (
                        <div className="h-px bg-[var(--muted-fg)] opacity-50 mx-[20px] sm:mx-6 lg:mx-8 mt-[15px]" />
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="pr-[25px]">
  <Button
    type="button"
    onClick={addPaymentRow}
    variant="secondary"
  >
    הוספת תקבול
  </Button>
</div>

                <div className="pt-[50px] mt-[50px]">
                  <div className="flex justify-between items-center">
                    <div className="text-lg font-bold" style={{ color: "#19183B" }}>
                      
                    </div>
                    <div className="text-2xl font-bold  ml-[50px]" style={{ color: "#19183B" }}>
                    סה״כ   {formatMoney(total, currency)}
                    </div>
                  </div>
                  {roundTotals && (
                    <p className="text-xs mt-2 text-right" style={{ color: "#19183B", opacity: 0.8 }}>
                      כולל עיגול לסכום סופי
                    </p>
                  )}
                </div>
              </div>
            </FormSection>

            <FormSection title="הערות">
              <div
                className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 bg-white rounded-[20px]  border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]"
              >
                <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                  <FloatingTextarea
                    label="הערות שיופיעו במסמך"
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    containerClassName="w-full min-w-0"
                    className="min-h-[100px] resize-y"
                  />

                  <FloatingTextarea
                    label="הערות שיופיעו בגוף המייל"
                    id="emailNotes"
                    value={emailNotes}
                    onChange={(e) => setEmailNotes(e.target.value)}
                    containerClassName="w-full min-w-0"
                    className="min-h-[100px] resize-y"
                  />
                </div>
              </div>
            </FormSection>

            <div className="mt-10 flex gap-4 justify-end">
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

          {message && (
            <Card
              className={cn(
                "mt-[50px]",
                message.includes("שגיאה") ? "border-danger bg-danger/10" : "border-success bg-success/10"
              )}
            >
              <CardContent className="p-4">
                <div
                  className={cn(
                    "flex items-center gap-3 font-medium",
                    message.includes("שגיאה") ? "text-danger" : "text-success"
                  )}
                >
                  {message.includes("שגיאה") && "⚠️"}
                  {!message.includes("שגיאה") && "✓"}
                  <span>{message}</span>
                </div>
              </CardContent>
            </Card>
          )}

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

          {showStartingNumberModal && (
            <StartingNumberModal
              documentType="receipt"
              onClose={() => {
                window.location.href = "/dashboard/documents";
              }}
              onSuccess={() => {
                setShowStartingNumberModal(false);
                setSequenceLocked(true);
                window.location.reload();
              }}
            />
          )}

          <ReceiptPreviewModal
            isOpen={previewModalOpen}
            onClose={() => setPreviewModalOpen(false)}
            pdfUrl={previewPdfUrl || undefined}
            isLoading={busy === "preview"}
            error={previewError}
          />

          <ReceiptConfirmationModal
            isOpen={confirmationModalOpen}
            onClose={() => {
              if (isFinalizing) return;
              setConfirmationModalOpen(false);
            }}
            onConfirm={handleIssueConfirm}
            documentType="receipt"
            documentDate={documentDate}
            customerName={customerName}
            total={total}
            currency={currency}
            isLoading={busy === "issue" || isFinalizing}
            hasEmail={false}
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

          {successModalData && (
            <ReceiptSuccessModal
              isOpen={successModalOpen}
              onClose={() => {
                window.location.href = "/dashboard";
              }}
              documentNumber={successModalData.documentNumber}
              companyName={successModalData.companyName}
              documentTypeLabel={successModalData.documentTypeLabel}
              documentId={successModalData.documentId}
              baseLanguage={successModalData.language}
              onViewDocument={async () => {
                window.location.href = `/dashboard/documents/receipt/${successModalData.documentId}/summary`;
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
                  if (blob.size === 0) throw new Error("Downloaded PDF is empty");

                  const pdfBlob = new Blob([blob], { type: "application/pdf" });
                  const downloadUrl = window.URL.createObjectURL(pdfBlob);
                  const link = document.createElement("a");
                  link.href = downloadUrl;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-he.pdf`;
                  link.download = fileName;
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
                  if (blob.size === 0) throw new Error("Downloaded PDF is empty");

                  const pdfBlob = new Blob([blob], { type: "application/pdf" });
                  const downloadUrl = window.URL.createObjectURL(pdfBlob);
                  const link = document.createElement("a");
                  link.href = downloadUrl;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-en.pdf`;
                  link.download = fileName;
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
