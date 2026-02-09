"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { InitialReceiptCreateData, PaymentRow, ReceiptDraftPayload } from "@/lib/documents/types";
import {
  issueReceiptAction,
  saveReceiptDraftAction,
  updateReceiptDraftAction,
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
import { DateInput } from "@/components/ui/date-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyAmountGroup } from "@/components/ui/currency-amount-group";
import { Card, CardContent } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { cn } from "@/lib/utils";
import { Trash2, Save, CheckCircle, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { FxRateDialog } from "@/components/payments/FxRateDialog";
import { currencySymbol } from "@/lib/currency/symbol";
import {
  createDocumentLinkAction,
  getDocumentForChainingAction,
  markDocumentCancelledAction,
} from "@/lib/documents/actions";

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

function formatMoney(amount: number, currency: string, showParensForNegative = false) {
  const n = Number.isFinite(amount) ? amount : 0;
  const curr = currencySymbol(currency);
  const formatted = `${Math.abs(n).toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${curr}`;
  if (showParensForNegative && n < 0) return `(${formatted})`;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${curr}`;
}

export default function ReceiptFormClient({
  initial,
  footerText,
  editData,
  draftId: draftIdProp,
}: {
  initial: InitialReceiptCreateData;
  footerText?: string;
  editData?: {
    id: string;
    customerName: string;
    documentDate: string;
    description?: string;
    total: number;
    currency: string;
    notes: string;
    payments?: PaymentRow[];
  } | null;
  draftId?: string;
}) {
  const searchParams = useSearchParams();
  const draftId = draftIdProp ?? (initial.ok ? initial.draftId ?? undefined : undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);

  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["ILS", "USD", "EUR"]
  );
  const [currency, setCurrency] = useState<string>(initial.ok ? initial.settings.defaultCurrency : "ILS");
  const isFxScenario = language === "en" && currency === "ILS";

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const customerFallbackSetRef = useRef(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [chainSourceDocumentId, setChainSourceDocumentId] = useState<string | null>(null);
  const [isCancellationReceipt, setIsCancellationReceipt] = useState(false);
  const [paymentErrors, setPaymentErrors] = useState<{ [key: number]: { method?: string; amount?: string } }>({});
  const [fxLoading, setFxLoading] = useState<Record<number, boolean>>({});
  const [fxApiErrors, setFxApiErrors] = useState<Record<number, string>>({});

  const [notes, setNotes] = useState("");
  const [emailNotes, setEmailNotes] = useState("");

  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const paymentsTableRef = useRef<HTMLDivElement>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "", date: todayYmd(), amount: 0, currency }]);
  const [confirmedPayments, setConfirmedPayments] = useState<Set<number>>(new Set());
  const [showPaymentsApprovalWarning, setShowPaymentsApprovalWarning] = useState(false);

  const [busy, setBusy] = useState<null | "draft" | "issue" | "preview">(null);
  const [message, setMessage] = useState<string | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Consent is treated as granted-on-login; keep state removed to avoid accidental blocking.

  const [successModalData, setSuccessModalData] = useState<{
    documentId: string;
    documentNumber: string;
    companyName: string;
    documentTypeLabel: string;
    language: "he" | "en";
    signing?: any;
  } | null>(null);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (initial.ok && !initial.sequenceLocked && !draftId) {
      setShowStartingNumberModal(true);
    }
  }, [initial, draftId]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    if (editData) {
      setCustomerName(editData.customerName);
      setDocumentDate(editData.documentDate);
      setCurrency(editData.currency);
      setNotes(editData.notes);
      if (typeof editData.description === "string") setDescription(editData.description);
      if (editData.payments && editData.payments.length > 0) {
        setPayments(editData.payments);
        setConfirmedPayments(new Set(editData.payments.map((_, idx) => idx)));
      }
    }
  }, [editData]);


  // Optional prefill from URL params (UI only; no DB logic changes)
  useEffect(() => {
    if (editData || (draftId && initial.ok && initial.draftOrigin === "existing")) return;
    const prefillCustomerId = searchParams.get("customerId");
    const prefillCustomerName = searchParams.get("customerName");
    const prefillNotes = searchParams.get("notes");
    const prefillDescription = searchParams.get("description");
    const prefillSourceDocumentId = searchParams.get("sourceDocumentId");
    const prefillCancellation = searchParams.get("cancellation");

    if (prefillCustomerId) setCustomerId(prefillCustomerId);
    if (prefillCustomerName) setCustomerName(prefillCustomerName);
    if (!prefillCustomerName && prefillSourceDocumentId && prefillCancellation === "1" && !customerFallbackSetRef.current) {
      customerFallbackSetRef.current = true;
      setCustomerName("לקוח לא מזוהה");
    }
    if (prefillNotes) setNotes(prefillNotes);
    if (prefillDescription) setDescription(prefillDescription);
    if (prefillCancellation === "1") setIsCancellationReceipt(true);
    if (prefillSourceDocumentId) {
      setChainSourceDocumentId(prefillSourceDocumentId);
      // For receipts, load payments from source document items
      getDocumentForChainingAction(prefillSourceDocumentId).then((res) => {
        if (res.ok) {
          const sourcePayments = (res.document as any).payments as PaymentRow[] | undefined;
          const basePayments = sourcePayments && sourcePayments.length > 0
            ? sourcePayments
            : (res.document.items || []).map((item) => ({
                method: prefillCancellation === "1" ? "מזומן" : "",
                date: todayYmd(),
                amount: item.lineTotal || (item.quantity * item.unitPrice),
                currency: item.currency || currency,
              }));

          if (basePayments.length > 0) {
            const normalizedPayments = basePayments.map((p) => ({
              ...p,
              amount: (prefillCancellation === "1" ? -Math.abs(p.amount || 0) : p.amount || 0),
              currency: p.currency || currency,
              method: (p.method && String(p.method).trim().length > 0 ? p.method : "מזומן") as any,
              date: p.date || todayYmd(),
              bankBranch: (p as any).bankBranch ?? (p as any).branch ?? undefined,
              bankAccount: (p as any).bankAccount ?? (p as any).accountNumber ?? undefined,
            }));

            setPayments(normalizedPayments);
            setConfirmedPayments(new Set(normalizedPayments.map((_, idx) => idx)));
          }
          const sourceDocumentDate = (res.document as any).documentDate as string | null | undefined;
          if (isCancellationReceipt && sourceDocumentDate) {
            setDocumentDate(sourceDocumentDate);
          }
        }
      });
    }
  }, [searchParams, editData, draftId, currency]);


  const previewNumber = initial.ok ? initial.previewNumber : null;

  const total = useMemo(() => {
    const sum = payments.reduce((acc, p, idx) => {
      if (!confirmedPayments.has(idx)) return acc;
      const amt = Number.isFinite(p.amount) ? p.amount : 0;
      if (!isFxScenario) return acc + amt;
      const rowCur = String(p.currency || currency);
      if (rowCur === "ILS") return acc + amt;
      const fx = Number((p as any).fxRate);
      if (!Number.isFinite(fx) || fx <= 0) return acc;
      return acc + amt * fx;
    }, 0);
    if (!roundTotals) return sum;
    return Math.round(sum);
  }, [payments, confirmedPayments, roundTotals, isFxScenario, currency]);
  const hasConfirmedPayments = confirmedPayments.size > 0;
  const unconfirmedPaymentRowIndices = useMemo(() => {
    const out: number[] = [];
    payments.forEach((_, idx) => {
      if (!confirmedPayments.has(idx)) out.push(idx);
    });
    return out;
  }, [payments, confirmedPayments]);
  const allPaymentsConfirmed = payments.length > 0 && unconfirmedPaymentRowIndices.length === 0;

  useEffect(() => {
    if (unconfirmedPaymentRowIndices.length === 0) setShowPaymentsApprovalWarning(false);
  }, [unconfirmedPaymentRowIndices.length]);
  useEffect(() => {
    if (!isCancellationReceipt) return;
  }, [isCancellationReceipt, chainSourceDocumentId, payments.length, total]);

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
      allowNegativePayments: isCancellationReceipt,
    };
  }, [customerName, customerId, documentDate, description, payments, notes, currency, total, roundTotals, language, isCancellationReceipt]);

  useEffect(() => {
    if (currency !== "ILS") {
      setPayments((prev) =>
        prev.map((p) => ({
          ...p,
          currency,
          fxRate: undefined,
          fxRateDate: undefined,
          fxRateSource: undefined,
        }))
      );
      return;
    }
    if (!isFxScenario) {
      setPayments((prev) =>
        prev.map((p) => ({
          ...p,
          currency: "ILS",
          fxRate: undefined,
          fxRateDate: undefined,
          fxRateSource: undefined,
        }))
      );
    }
  }, [currency, isFxScenario]);

  async function fetchFxRateForRow(i: number, baseCurrency: string, paymentDate: string) {
    const base = String(baseCurrency || "").toUpperCase().trim();
    const date = String(paymentDate || "").trim();
    if (!/^[A-Z]{3}$/.test(base) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    setFxLoading((prev) => ({ ...prev, [i]: true }));
    setFxApiErrors((prev) => {
      if (!prev[i]) return prev;
      const next = { ...prev };
      delete next[i];
      return next;
    });
    try {
      const res = await fetch(`/api/fx-rate?base=${encodeURIComponent(base)}&date=${encodeURIComponent(date)}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || "FX rate fetch failed");
      }
      setPayments((prev) =>
        prev.map((r, idx) =>
          idx === i
            ? {
                ...r,
                fxRate: Number(json.rate),
                fxRateDate: String(json.rateDate || ""),
                fxRateSource: "boi",
              }
            : r
        )
      );
    } catch (e: any) {
      setFxApiErrors((prev) => ({
        ...prev,
        [i]: "לא ניתן להביא שער המרה כרגע, אנא נסה שוב או הזן ידנית",
      }));
      setPaymentErrors((prev) => ({
        ...prev,
        [i]: { ...(prev[i] || {}), amount: "חסר שער המרה" },
      }));
    } finally {
      setFxLoading((prev) => ({ ...prev, [i]: false }));
    }
  }



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
    setConfirmedPayments((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function removePaymentRow(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
    setConfirmedPayments((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function validatePaymentRow(payment: PaymentRow) {
    const errors: { method?: string; amount?: string } = {};
    if (!payment.method || payment.method.trim().length === 0) {
      errors.method = "חובה לבחור אמצעי תשלום";
    }
    if (!Number.isFinite(payment.amount) || (isCancellationReceipt ? payment.amount >= 0 : payment.amount <= 0)) {
      errors.amount = `סכום חייב להיות ${isCancellationReceipt ? "קטן מ-0" : "גדול מ-0"}`;
    }
    if (isFxScenario) {
      const rowCur = String(payment.currency || currency);
      if (rowCur !== "ILS") {
        const fx = Number((payment as any).fxRate);
        if (!Number.isFinite(fx) || fx <= 0) {
          errors.amount = "חובה לעדכן שער המרה";
        }
      }
    }
    return errors;
  }

  function confirmPaymentRow(i: number) {
    const errors = validatePaymentRow(payments[i]);
    if (Object.keys(errors).length > 0) {
      setPaymentErrors((prev) => ({ ...prev, [i]: errors }));
      return;
    }
    setPaymentErrors((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      return next;
    });
    setConfirmedPayments((prev) => new Set(prev).add(i));
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

    if (!allPaymentsConfirmed) {
      setShowPaymentsApprovalWarning(true);
      toast.error("יש לאשר את כל התקבולים לפני תצוגה מקדימה");
      focusFieldWithError(paymentsTableRef);
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
        currency: currency || "ILS",
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
    if (!allPaymentsConfirmed) {
      setShowPaymentsApprovalWarning(true);
      toast.error("יש לאשר את כל התקבולים לפני הפקת מסמך");
      focusFieldWithError(paymentsTableRef);
      return;
    }
    setConfirmationModalOpen(true);
  }

  // Consent loading removed (no longer required).

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
      else if (!payment.amount || (isCancellationReceipt ? payment.amount >= 0 : payment.amount <= 0))
        rowErrors.amount = `סכום חייב להיות ${isCancellationReceipt ? "קטן מ-0" : "גדול מ-0"}`;
      if (Object.keys(rowErrors).length > 0) errors[i] = rowErrors;
    });

    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      focusFieldWithError(paymentsTableRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    // Recipient consent is not required for issuing.

    if (!allPaymentsConfirmed) {
      setShowPaymentsApprovalWarning(true);
      toast.error("יש לאשר את כל התקבולים לפני הפקת מסמך");
      focusFieldWithError(paymentsTableRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    setBusy("issue");
    try {
      const result = await issueReceiptAction(payload, draftId);

      if (!result || !result.ok) {
        toast.error(result?.message || "הפקת המסמך נכשלה - שגיאה לא ידועה");
        setBusy(null);
        setIsFinalizing(false);
        return;
      }

      if (chainSourceDocumentId) {
        // Fetch source document to check if we should create payment link
        const sourceDoc = await getDocumentForChainingAction(chainSourceDocumentId);
        
        let linkType: "related" | "payment" | "cancellation" = "related";
        let linkAmount = 0;
        
        if (isCancellationReceipt) {
          linkType = "cancellation";
          linkAmount = Math.abs(total);
        } else {
          // If amounts match, treat as payment to close source
          if (
            sourceDoc.ok &&
            sourceDoc.document.totalAmount &&
            Math.abs(total - sourceDoc.document.totalAmount) < 0.01
          ) {
            linkType = "payment";
            linkAmount = total;
          }
        }
        
        const note = notes ? `שרשור: ${notes}` : null;
        const linkRes = await createDocumentLinkAction({
          sourceDocumentId: isCancellationReceipt ? result.receiptId : chainSourceDocumentId,
          targetDocumentId: isCancellationReceipt ? chainSourceDocumentId : result.receiptId,
          linkType,
          amount: linkAmount,
          note,
        });
        if (!linkRes.ok) {
          toast.error(linkRes.message || "השרשור נכשל: לא ניתן ליצור קשר בין המסמכים");
        } else if (isCancellationReceipt) {
          const cancelRes = await markDocumentCancelledAction({
            documentId: chainSourceDocumentId,
            reason: "cancelled_by_negative_receipt",
          });
          if (!cancelRes.ok) {
            toast.error(cancelRes.message || "לא ניתן לעדכן סטטוס מסמך מקור");
          }
        }
      }

      setSuccessModalData({
        documentId: result.receiptId,
        documentNumber: result.documentNumber || "",
        companyName: result.companyName || "העסק שלי",
        documentTypeLabel: "קבלה",
        language,
        signing: (result as any).signing ?? null,
      });
      setSuccessModalOpen(true);
      setConfirmationModalOpen(false);
      setBusy(null);
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
    <main dir="rtl" className="min-h-screen ui-document-form">
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
                {(Object.keys(paymentErrors).length > 0 ||
                  (showPaymentsApprovalWarning && unconfirmedPaymentRowIndices.length > 0)) && (
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
                        {Object.keys(paymentErrors).length > 0
                          ? "יש לתקן את השדות המסומנים באדום"
                          : "יש לאשר את התקבולים לפני המשך"}
                      </span>
                    </div>
                    {showPaymentsApprovalWarning && unconfirmedPaymentRowIndices.length > 0 ? (
                      <div style={{ marginTop: "8px", fontSize: "14px", color: "#9B0003" }}>
                        יש {unconfirmedPaymentRowIndices.length} תקבולים שלא אושרו — לחץ/י על &quot;אישור&quot; בכל שורה
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="space-y-[20px]">
                  {/* Headers Row */}
                  <div className="px-[20px] sm:px-6 lg:px-8">
                    <div className="hidden md:grid md:grid-cols-[minmax(140px,20%)_minmax(120px,140px)_minmax(160px,200px)_minmax(96px,110px)_1fr_minmax(120px,140px)] gap-3 items-center font-semibold">
                      <div className="text-right pr-[12px] translate-y-[20px]">אמצעי תשלום</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">תאריך</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">סכום</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">מטבע</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">פרטים נוספים</div>
                      <div className="text-right pr-[12px] translate-y-[20px] ui-payments-actions-label-offset">
                        פעולות
                      </div>
                    </div>
                  </div>

                  {payments.map((row, i) => (
                    <div key={i}>
                      <div
                        className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 ti-items-row"
                        data-payment-card="true"
                        data-locked={confirmedPayments.has(i) ? "true" : "false"}
                      >
                        <div className="min-w-0">
                          {/* Desktop View - Single Row Grid */}
                          <div className="hidden md:grid md:grid-cols-[minmax(140px,20%)_minmax(120px,140px)_minmax(160px,200px)_minmax(96px,110px)_1fr_minmax(120px,140px)] gap-3 items-center">
                            {/* אמצעי תשלום - 24% */}
                            <div className="w-full min-w-0">
                              <Select
                                value={row.method}
                                disabled={confirmedPayments.has(i)}
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
                                  variant="underline"
                                  className={cn(
                                    "ti-items-select w-full min-w-0",
                                    paymentErrors[i]?.method ? "border-danger focus:border-danger" : ""
                                  )}
                                  aria-label="אמצעי תשלום"
                                >
                                  <SelectValue placeholder="בחר..." />
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

                            {/* תאריך - 13% */}
                            <DateInput
                              id={`payment-date-${i}`}
                              value={row.date}
                              onChange={(v) => {
                                updatePaymentRow(i, { date: v });
                                const rowCur = String(row.currency || currency);
                                if (
                                  isFxScenario &&
                                  rowCur !== "ILS" &&
                                  row.fxRateSource !== "manual"
                                ) {
                                  fetchFxRateForRow(i, rowCur, v);
                                }
                              }}
                              className="ti-items-input text-right min-w-0"
                              variant="items"
                              disabled={confirmedPayments.has(i)}
                            />

                            {/* סכום - 13% */}
                            <div className="relative min-w-0">
                              <MoneyInput
                                className={cn(
                                  "w-full min-w-0 text-right",
                                  isFxScenario &&
                                    confirmedPayments.has(i) &&
                                    String(row.currency || currency) !== "ILS"
                                    ? "pl-9"
                                    : "",
                                  confirmedPayments.has(i) ? "pointer-events-none" : ""
                                )}
                                error={!!paymentErrors[i]?.amount}
                                variant="items"
                                allowNegative={isCancellationReceipt}
                                displayValue={
                                  isCancellationReceipt
                                    ? formatMoney(row.amount, currency, true)
                                    : undefined
                                }
                                readOnly={isCancellationReceipt}
                                value={row.amount}
                                onChange={(v) => {
                                  const next = isCancellationReceipt ? -Math.abs(v) : v;
                                  updatePaymentRow(i, { amount: next });
                                  if (paymentErrors[i]?.amount && (isCancellationReceipt ? next < 0 : next > 0)) {
                                    const newErrors = { ...paymentErrors };
                                    if (newErrors[i]) {
                                      delete newErrors[i].amount;
                                      if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                    }
                                    setPaymentErrors(newErrors);
                                  }
                                }}
                                currency={row.currency || currency}
                              />
                              {isFxScenario &&
                              confirmedPayments.has(i) &&
                              String(row.currency || currency) !== "ILS" ? (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2">
                                  <FxRateDialog
                                    baseCurrency={String(row.currency || "").toUpperCase()}
                                    rate={Number.isFinite(Number(row.fxRate)) ? Number(row.fxRate) : null}
                                    disabled={!!fxLoading[i]}
                                    onUpdateRate={(nextRate) => {
                                      updatePaymentRow(i, {
                                        fxRate: nextRate,
                                        fxRateSource: "manual",
                                        fxRateDate: row.fxRateDate || row.date || todayYmd(),
                                      });
                                      if (paymentErrors[i]?.amount) {
                                        setPaymentErrors((prev) => {
                                          const next = { ...prev }
                                          const rowErr = next[i]
                                          if (!rowErr) return prev
                                          const cloned = { ...rowErr }
                                          delete cloned.amount
                                          if (Object.keys(cloned).length === 0) delete next[i]
                                          else next[i] = cloned as any
                                          return next
                                        })
                                      }
                                    }}
                                  />
                                </div>
                              ) : null}
                            {!fxApiErrors[i] && paymentErrors[i]?.amount ? (
                              <div className="absolute right-0 top-full mt-1 text-right text-[14px] text-danger">
                                {paymentErrors[i]?.amount}
                              </div>
                            ) : null}
                            {fxApiErrors[i] ? (
                              <div className="absolute right-0 top-full mt-1 text-right text-[14px] text-danger">
                                {fxApiErrors[i]}
                              </div>
                            ) : null}
                            </div>

                            {/* מטבע */}
                            <Select
                              value={row.currency || currency}
                              disabled={!isFxScenario || confirmedPayments.has(i)}
                              onValueChange={(v) => {
                                const next = String(v || "").toUpperCase().trim();
                                setPayments((prev) =>
                                  prev.map((r, idx) =>
                                    idx === i
                                      ? {
                                          ...r,
                                          currency: next,
                                          fxRate: undefined,
                                          fxRateDate: undefined,
                                          fxRateSource: undefined,
                                        }
                                      : r
                                  )
                                );
                                if (isFxScenario && next !== "ILS") {
                                  fetchFxRateForRow(i, next, row.date || documentDate || todayYmd());
                                }
                              }}
                            >
                              <SelectTrigger
                                variant="underline"
                                className={cn(
                                  "ti-items-select w-full min-w-0",
                                  paymentErrors[i]?.amount
                                    ? "border-[color:var(--field-border-error)] focus:border-[color:var(--field-border-error)]"
                                    : ""
                                )}
                                aria-label="מטבע"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {allowedCurrencies.map((c) => (
                                  <SelectItem key={c} value={c}>
                                      {currencySymbol(c)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* פרטים נוספים - flex-1 */}
                            <div className="min-w-0">
                              <PaymentDetailsSection
                                payment={row}
                                onUpdate={(updates) => updatePaymentRow(i, updates)}
                                isConfirmed={confirmedPayments.has(i)}
                                renderMode="inline"
                              />
                            </div>

                            {/* כפתורים - 1fr */}
                            <div className="flex items-center justify-end gap-2">
                              {confirmedPayments.has(i) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setConfirmedPayments((prev) => {
                                      const next = new Set(prev);
                                      next.delete(i);
                                      return next;
                                    })
                                  }
                                  aria-label="עריכה"
                                  className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="default"
                                  onClick={() => confirmPaymentRow(i)}
                                  disabled={!!fxLoading[i]}
                                >
                                  אישור
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removePaymentRow(i)}
                                disabled={payments.length === 1}
                                title={payments.length === 1 ? "חייב להיות לפחות תקבול אחד" : "מחיקה"}
                                aria-label="מחיקה"
                                className="text-danger hover:text-danger hover:bg-danger/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Mobile View - Stack (only for mobile) */}
                          <div className="md:hidden space-y-4">
                            {/* אמצעי תשלום */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">אמצעי תשלום</label>
                              <Select
                                value={row.method}
                                disabled={confirmedPayments.has(i)}
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
                                  variant="underline"
                                  className={cn(
                                    "ti-items-select w-full",
                                    paymentErrors[i]?.method ? "border-danger focus:border-danger" : ""
                                  )}
                                  aria-label="אמצעי תשלום"
                                >
                                  <SelectValue placeholder="בחר..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {PAYMENT_METHODS.map((m) => (
                                    <SelectItem key={m} value={m}>
                                      {m}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* עריכת מטבע במובייל: לא קיימת, המטבע עריך רק לפני אישור */}
                            </div>

                            {/* תאריך */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">תאריך תשלום</label>
                              <DateInput
                                id={`payment-date-mobile-${i}`}
                                value={row.date}
                                onChange={(v) => {
                                  updatePaymentRow(i, { date: v });
                                  const rowCur = String(row.currency || currency);
                                  if (
                                    isFxScenario &&
                                    rowCur !== "ILS" &&
                                    row.fxRateSource !== "manual"
                                  ) {
                                    fetchFxRateForRow(i, rowCur, v);
                                  }
                                }}
                                className="ti-items-input text-right w-full"
                                variant="items"
                                disabled={confirmedPayments.has(i)}
                              />
                            </div>

                            {/* סכום + מטבע - ביחד במובייל */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">סכום</label>
                              <div className="flex gap-3 items-center">
                                <div className="flex-1 min-w-0">
                                  <MoneyInput
                                    className={cn(
                                      "w-full text-right",
                                      confirmedPayments.has(i) ? "pointer-events-none" : ""
                                    )}
                                    error={!!paymentErrors[i]?.amount}
                                    variant="items"
                                    allowNegative={isCancellationReceipt}
                                    displayValue={
                                      isCancellationReceipt
                                        ? formatMoney(row.amount, currency, true)
                                        : undefined
                                    }
                                    readOnly={isCancellationReceipt}
                                    value={row.amount}
                                    onChange={(v) => {
                                      const next = isCancellationReceipt ? -Math.abs(v) : v;
                                      updatePaymentRow(i, { amount: next });
                                      if (paymentErrors[i]?.amount && (isCancellationReceipt ? next < 0 : next > 0)) {
                                        const newErrors = { ...paymentErrors };
                                        if (newErrors[i]) {
                                          delete newErrors[i].amount;
                                          if (Object.keys(newErrors[i]).length === 0) delete newErrors[i];
                                        }
                                        setPaymentErrors(newErrors);
                                      }
                                    }}
                                    currency={row.currency || currency}
                                  />
                                </div>

                                <div className="w-[60px]">
                                  <Select
                                    value={row.currency || currency}
                                    disabled={!isFxScenario || confirmedPayments.has(i)}
                                    onValueChange={(v) => {
                                      const next = String(v || "").toUpperCase().trim();
                                      setPayments((prev) =>
                                        prev.map((r, idx) =>
                                          idx === i
                                            ? {
                                                ...r,
                                                currency: next,
                                                fxRate: undefined,
                                                fxRateDate: undefined,
                                                fxRateSource: undefined,
                                              }
                                            : r
                                        )
                                      );
                                      if (isFxScenario && next !== "ILS") {
                                        fetchFxRateForRow(i, next, row.date || documentDate || todayYmd());
                                      }
                                    }}
                                  >
                                    <SelectTrigger
                                      variant="underline"
                                      className={cn(
                                        "ti-items-select w-full",
                                        paymentErrors[i]?.amount
                                          ? "border-[color:var(--field-border-error)] focus:border-[color:var(--field-border-error)]"
                                          : ""
                                      )}
                                      aria-label="מטבע"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {allowedCurrencies.map((c) => (
                                        <SelectItem key={c} value={c}>
                                          {currencySymbol(c)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* עריכת מטבע במובייל: המטבע עריך רק לפני אישור */}

                                {isFxScenario &&
                                confirmedPayments.has(i) &&
                                String(row.currency || currency) !== "ILS" ? (
                                  <div className="shrink-0">
                                    <FxRateDialog
                                      baseCurrency={String(row.currency || "").toUpperCase()}
                                      rate={Number.isFinite(Number(row.fxRate)) ? Number(row.fxRate) : null}
                                      disabled={!!fxLoading[i]}
                                      onUpdateRate={(nextRate) => {
                                        updatePaymentRow(i, {
                                          fxRate: nextRate,
                                          fxRateSource: "manual",
                                          fxRateDate: row.fxRateDate || row.date || todayYmd(),
                                        });
                                      }}
                                    />
                                  </div>
                                ) : null}
                                {!fxApiErrors[i] && paymentErrors[i]?.amount ? (
                                  <div className="mt-1 text-right text-[14px] text-danger">
                                    {paymentErrors[i]?.amount}
                                  </div>
                                ) : null}
                                {fxApiErrors[i] ? (
                                  <div className="mt-1 text-right text-[14px] text-danger">
                                    {fxApiErrors[i]}
                                  </div>
                                ) : null}
                                {/* כפתורים בשורה עם הסכום */}
                                <div className="flex items-center justify-end gap-2 shrink-0">
                                  {confirmedPayments.has(i) ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setConfirmedPayments((prev) => {
                                          const next = new Set(prev);
                                          next.delete(i);
                                          return next;
                                        })
                                      }
                                      aria-label="עריכה"
                                      className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="default"
                                      onClick={() => confirmPaymentRow(i)}
                                      disabled={!!fxLoading[i]}
                                    >
                                      אישור
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removePaymentRow(i)}
                                    disabled={payments.length === 1}
                                    title={payments.length === 1 ? "חייב להיות לפחות תקבול אחד" : "מחיקה"}
                                    aria-label="מחיקה"
                                    className="text-danger hover:text-danger hover:bg-danger/10"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {fxApiErrors[i] ? (
                              <div className="mt-1 text-right text-[14px] text-danger">
                                {fxApiErrors[i]}
                              </div>
                            ) : null}

                            {/* פרטים נוספים */}
                            {row.method && (
                              <div className="w-full">
                                <label className="block text-sm text-muted-fg mb-2">פרטים נוספים</label>
                                <PaymentDetailsSection
                                  payment={row}
                                  onUpdate={(updates) => updatePaymentRow(i, updates)}
                                  isConfirmed={confirmedPayments.has(i)}
                                  renderMode="inline"
                                />
                              </div>
                            )}
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
                  <Button type="button" onClick={addPaymentRow} variant="secondary">
                    הוספת תקבול
                  </Button>
                </div>

                {hasConfirmedPayments && (
                  <div className="pt-[50px] mt-[50px]">
                    <div className="flex justify-between items-center">
                      <div className="text-lg font-bold" style={{ color: "#19183B" }}></div>
                      <div className="text-2xl font-bold  ml-[50px]" style={{ color: "#19183B" }}>
                        סה״כ {formatMoney(total, currency, isCancellationReceipt)}
                      </div>
                    </div>
                    {roundTotals && (
                      <p className="text-xs mt-2 text-right" style={{ color: "#19183B", opacity: 0.8 }}>
                        כולל עיגול לסכום סופי
                      </p>
                    )}
                  </div>
                )}
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
            titleOverride={isCancellationReceipt ? "אישור הפקת קבלה שלילית" : undefined}
            documentDate={documentDate}
            customerName={customerName}
            total={total}
            currency={currency}
            isLoading={busy === "issue" || isFinalizing}
            hasEmail={false}
            isFinalizing={isFinalizing}
            consentState={undefined}
            consentChecked={undefined}
            onConsentCheckedChange={undefined}
            onRevokeConsent={undefined}
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
                  const signing = (successModalData as any)?.signing
                  const b64 =
                    issue === "original"
                      ? signing?.signed_pdf_base64?.original_he
                      : signing?.signed_pdf_base64?.copy_he

                  if (!b64) {
                    throw new Error("Signed PDF not available (no-storage policy). Please re-issue.")
                  }

                  const binary = atob(b64)
                  const bytes = new Uint8Array(binary.length)
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                  const pdfBlob = new Blob([bytes], { type: "application/pdf" })

                  const downloadUrl = window.URL.createObjectURL(pdfBlob)
                  const link = document.createElement("a")
                  link.href = downloadUrl
                  const baseName = successModalData.documentNumber || successModalData.documentId
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-he.pdf`
                  link.download = fileName
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  window.URL.revokeObjectURL(downloadUrl)

                  if (issue === "original") {
                    // Regulatory: mark original as issued (idempotent).
                    fetch(`/api/documents/${successModalData.documentId}/issuance`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ language: "he" }),
                    }).catch(() => {})
                  }
                } catch (error: any) {
                  toast.error(`שגיאה בהורדת PDF: ${error.message}`);
                }
              }}
              onDownloadEnglish={async (opts) => {
                try {
                  const issue = opts?.issue || "copy";
                  // EN download is always "copy" in the UX, but keep issue param for compatibility.
                  void issue
                  const signing = (successModalData as any)?.signing
                  const b64 = signing?.signed_pdf_base64?.copy_en
                  if (!b64) {
                    throw new Error("Signed EN PDF not available.")
                  }

                  const binary = atob(b64)
                  const bytes = new Uint8Array(binary.length)
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                  const pdfBlob = new Blob([bytes], { type: "application/pdf" })

                  const downloadUrl = window.URL.createObjectURL(pdfBlob)
                  const link = document.createElement("a")
                  link.href = downloadUrl
                  const baseName = successModalData.documentNumber || successModalData.documentId
                  const fileName = `${baseName}-en.pdf`
                  link.download = fileName
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  window.URL.revokeObjectURL(downloadUrl)
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
