"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type {
  InitialInvoiceReceiptCreateData,
  InvoiceReceiptDraftPayload,
} from "./actions";
import type { PaymentRow } from "@/lib/types/receipt";
import {
  issueInvoiceReceiptAction,
  saveInvoiceReceiptDraftAction,
  updateInvoiceReceiptDraftAction,
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
import ReceiptSettingsSummary from "@/components/documents/receipt/ReceiptSettingsSummary";
import PaymentDetailsSection from "../receipt/PaymentDetailsSection";
import { FloatingInput } from "@/components/ui/floating-input";
import { FloatingTextarea } from "@/components/ui/floating-textarea";
import { FloatingDateInput } from "@/components/ui/floating-date-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { cn } from "@/lib/utils";
import { isDigitalSignaturesEnabledClient } from "@/lib/documents/signing/feature-flags-client";
import { getDocumentConfig } from "@/lib/documents/document-configs";
import { Trash2, Save, Eye, Pencil } from "lucide-react";
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
];

type ItemRow = {
  label: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  vatMode: "before" | "included";
};


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

export default function InvoiceReceiptFormClient({
  initial,
  editData,
  draftId,
}: {
  initial: InitialInvoiceReceiptCreateData;
  editData?: {
    id: string;
    customerName: string;
    documentDate: string;
    paymentDueDate?: string;
    total: number;
    currency: string;
    notes: string;
    vatType?: "regular" | "no_vat";
    vatRate?: number | null;
    vatAmount?: number | null;
    subtotal?: number | null;
  } | null;
  draftId?: string;
}) {
  const documentConfig = useMemo(() => getDocumentConfig("invoiceReceipt"), []);
  const documentLabel = "חשבונית מס / קבלה";
  const basePath = "/dashboard/documents";
  const digitalSignaturesEnabled = isDigitalSignaturesEnabledClient();

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);

  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["₪", "$", "€"]
  );
  const [currency, setCurrency] = useState<string>(
    initial.ok ? (initial.settings.currency || "₪") : "₪"
  );
  const [vatType, setVatType] = useState<"regular" | "no_vat">("regular");
  const defaultVatRate = useMemo(() => {
    const base = initial.ok ? initial.vatRate ?? 18 : 18;
    return Number.isFinite(base) ? base : 18;
  }, [initial]);
  const vatRate = vatType === "no_vat" ? 0 : defaultVatRate;

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [dueDate, setDueDate] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<{
    [key: number]: { description?: string; quantity?: string; unitPrice?: string; currency?: string };
  }>({});

  const [notes, setNotes] = useState("");
  const [emailNotes, setEmailNotes] = useState("");

  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const paymentsTableRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<ItemRow[]>([
    { label: "", sku: "", description: "", quantity: 1, unitPrice: 0, currency, vatMode: "before" },
  ]);
  const [confirmedRows, setConfirmedRows] = useState<Set<number>>(new Set());

  // Payment rows state (from Receipt)
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "", date: todayYmd(), amount: 0, currency }]);
  const [confirmedPayments, setConfirmedPayments] = useState<Set<number>>(new Set());
  const [paymentErrors, setPaymentErrors] = useState<Record<number, { method?: string; amount?: string }>>({});

  const [busy, setBusy] = useState<null | "draft" | "issue" | "preview">(null);
  const [message, setMessage] = useState<string | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [mismatchWarningOpen, setMismatchWarningOpen] = useState(false);

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
  const summaryBlockRef = useRef<HTMLDivElement | null>(null);
  const summaryRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const summaryValueRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const addItemButtonRef = useRef<HTMLDivElement | null>(null);
  const headerTotalRef = useRef<HTMLDivElement | null>(null);
  const itemTotalRef = useRef<HTMLDivElement | null>(null);
  const summaryOuterRef = useRef<HTMLDivElement | null>(null);
  const summaryLabelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const summaryValueContainerRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (initial.ok && !initial.sequenceLocked && !draftId) {
      setShowStartingNumberModal(true);
    }
  }, [initial, draftId]);

  useEffect(() => {
    if (editData) {
      setCustomerName(editData.customerName);
      setDocumentDate(editData.documentDate);
      setDueDate(editData.paymentDueDate || editData.documentDate);
      setCurrency(editData.currency);
      setNotes(editData.notes);
      if (editData.vatType) setVatType(editData.vatType);
    }
  }, [editData]);

  useEffect(() => {
    if (dueDate < documentDate) {
      setDueDate(documentDate);
    }
  }, [documentDate, dueDate]);

  const previewNumber = initial.ok ? initial.previewNumber : null;

  const getLineGross = useCallback((item: ItemRow) => {
    const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
    const unit = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
    return Number((qty * unit).toFixed(2));
  }, []);

  const getLineNet = useCallback(
    (item: ItemRow) => {
      const gross = getLineGross(item);
      if (vatRate <= 0) return gross;
      if (item.vatMode === "included") {
        const net = gross / (1 + vatRate / 100);
        return Number(net.toFixed(2));
      }
      return gross;
    },
    [getLineGross, vatRate]
  );

  const getLineVat = useCallback(
    (item: ItemRow) => {
      if (vatRate <= 0) return 0;
      const net = getLineNet(item);
      if (item.vatMode === "included") {
        const gross = getLineGross(item);
        return Number((gross - net).toFixed(2));
      }
      return Number((net * (vatRate / 100)).toFixed(2));
    },
    [getLineGross, getLineNet, vatRate]
  );

  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => acc + getLineNet(item), 0);
  }, [items, getLineNet]);
  const vatAmount = useMemo(() => {
    if (vatRate <= 0) return 0;
    return Number(items.reduce((acc, item) => acc + getLineVat(item), 0).toFixed(2));
  }, [items, vatRate, getLineVat]);
  const total = useMemo(() => {
    if (vatRate <= 0) return subtotal;
    const sum = subtotal + vatAmount;
    if (!roundTotals) return sum;
    return Math.round(sum);
  }, [subtotal, vatAmount, vatRate, roundTotals]);
  const hasConfirmedItems = confirmedRows.size > 0;
  const hasConfirmedPayments = confirmedPayments.size > 0;

  const payload: InvoiceReceiptDraftPayload = useMemo(() => {
    return {
      documentType: "invoiceReceipt",
      customerName,
      customerId,
      documentDate,
      paymentDueDate: "",
      description,
      payments: payments,
      items: items.map((item) => ({
        ...item,
        lineTotal: getLineNet(item),
      })),
      notes,
      currency,
      total,
      vatType,
      vatRate,
      vatAmount,
      subtotal,
      roundTotals,
      language,
    };
  }, [
    customerName,
    customerId,
    documentDate,
    description,
    items,
    payments,
    notes,
    currency,
    total,
    getLineNet,
    vatType,
    vatRate,
    vatAmount,
    subtotal,
    roundTotals,
    language,
  ]);

  // Update payment currencies when currency changes
  useEffect(() => {
    if (currency !== "₪") {
      setPayments((prev) => prev.map((p) => ({ ...p, currency })));
    }
  }, [currency]);

  useEffect(() => {
    if (currency !== "₪") {
      setItems((prev) => prev.map((item) => ({ ...item, currency })));
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

  function addItemRow() {
    setItems((prev) => [
      ...prev,
      { label: "", sku: "", description: "", quantity: 1, unitPrice: 0, currency, vatMode: "before" },
    ]);
  }

  function updateItemRow(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setConfirmedRows((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function removeItemRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    setConfirmedRows((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function validateItemRow(item: ItemRow) {
    const errors: { description?: string; quantity?: string; unitPrice?: string; currency?: string } = {};
    if (!item.description || item.description.trim().length === 0) {
      errors.description = "חובה למלא פירוט";
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      errors.quantity = "כמות חייבת להיות גדולה מ-0";
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
      errors.unitPrice = "מחיר חייב להיות גדול מ-0";
    }
    if (!item.currency) {
      errors.currency = "חובה לבחור מטבע";
    }
    return errors;
  }

  function confirmItemRow(i: number) {
    const errors = validateItemRow(items[i]);
    if (Object.keys(errors).length > 0) {
      setItemErrors((prev) => ({ ...prev, [i]: errors }));
      return;
    }
    setItemErrors((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      return next;
    });
    setConfirmedRows((prev) => new Set(prev).add(i));
  }

  // Payment functions (from Receipt)
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
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      errors.amount = "סכום חייב להיות גדול מ-0";
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

  // Validation: Check if items total matches payments total
  function validateTotalsMismatch(): boolean {
    const paymentsTotal = payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0);
    const itemsTotal = total; // This includes VAT
    
    // Allow small rounding differences (0.01)
    const diff = Math.abs(itemsTotal - paymentsTotal);
    return diff > 0.01;
  }

  function getLineTotal(item: ItemRow) {
    return getLineNet(item);
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

    if (!items || items.length === 0) {
      toast.error("חובה להוסיף לפחות פריט אחד");
      return;
    }

    const previewErrors: {
      [key: number]: { description?: string; quantity?: string; unitPrice?: string; currency?: string };
    } = {};
    items.forEach((item, i) => {
      const rowErrors = validateItemRow(item);
      if (Object.keys(rowErrors).length > 0) previewErrors[i] = rowErrors;
    });
    if (Object.keys(previewErrors).length > 0) {
      setItemErrors(previewErrors);
      focusFieldWithError(paymentsTableRef);
      return;
    }

    // Check totals mismatch
    if (validateTotalsMismatch()) {
      setMismatchWarningOpen(true);
      return;
    }

    setPreviewModalOpen(true);
    setBusy("preview");
    setPreviewError(null);
    setPreviewPdfUrl(null);

    try {
      const itemsForPreview = items.map((item) => ({
        label: item.label || "",
        sku: item.sku || "",
        description: item.description || "",
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        currency: item.currency || currency,
        vatMode: item.vatMode,
        lineTotal: getLineNet(item),
      }));

      const params = new URLSearchParams({
        previewNumber: previewNumber || "",
        customerName: customerName || "",
        customerId: customerId || "",
        documentDate: documentDate || todayYmd(),
        paymentDueDate: "",
        description: description || "",
        notes: notes || "",
        total: total.toString() || "0",
        subtotal: subtotal.toString(),
        vatRate: vatRate.toString(),
        vatAmount: vatAmount.toString(),
        vatType: vatType,
        currency: currency || "₪",
        items: JSON.stringify(itemsForPreview),
      });

      const docIdForPreview = draftId || (editData as any)?.id || null;
      if (docIdForPreview) params.set("documentId", String(docIdForPreview));

      setPreviewPdfUrl(`${basePath}/invoice-receipt/preview?${params.toString()}`);
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
    setItemErrors({});

    // Check totals mismatch
    if (validateTotalsMismatch()) {
      setMismatchWarningOpen(true);
      return;
    }

    setBusy("draft");
    try {
      let result;
      if (draftId && editData) result = await updateInvoiceReceiptDraftAction(draftId, payload);
      else result = await saveInvoiceReceiptDraftAction(payload);

      if (!result.ok) {
        toast.error(result.message || "שמירת טיוטה נכשלה");
        setBusy(null);
        return;
      }

      toast.success("הטיוטה נשמרה");
      setBusy(null);
      window.location.href = basePath;
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
    setItemErrors({});

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

    const errors: { [key: number]: { description?: string; quantity?: string; unitPrice?: string; currency?: string } } =
      {};
    items.forEach((item, i) => {
      const rowErrors = validateItemRow(item);
      if (Object.keys(rowErrors).length > 0) errors[i] = rowErrors;
    });

    if (Object.keys(errors).length > 0) {
      setItemErrors(errors);
      focusFieldWithError(paymentsTableRef);
      setIsFinalizing(false);
      setConfirmationModalOpen(false);
      return;
    }

    // Check totals mismatch
    if (validateTotalsMismatch()) {
      setMismatchWarningOpen(true);
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
      const result = await issueInvoiceReceiptAction(payload);

      if (!result || !result.ok) {
        toast.error(result?.message || "הפקת המסמך נכשלה - שגיאה לא ידועה");
        setBusy(null);
        setIsFinalizing(false);
        return;
      }

      setConfirmationModalOpen(false);
      setBusy(null);

      setSuccessModalData({
        documentId: result.documentId || "",
        documentNumber: result.documentNumber || "",
        companyName: result.companyName || "העסק שלי",
        documentTypeLabel: "חשבונית מס / קבלה",
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
              vatType,
              roundTotals,
              allowedCurrencies,
              allowedLanguages: [
                { value: "he", label: "עברית" },
                { value: "en", label: "English" },
              ],
              allowedVatTypes: [
                { value: "regular", label: "כולל מע״מ", summaryLabel: "כולל מע״מ (ברירת מחדל)" },
                { value: "no_vat", label: "ללא מע״מ (אילת / חו״ל)" },
              ],
              canEdit: {
                currency: true,
                language: true,
                vatType: true,
                roundTotals: true,
              },
            }}
            onChange={(patch) => {
              if (patch.currency !== undefined) setCurrency(patch.currency);
              if (patch.language !== undefined) setLanguage(patch.language as "he" | "en");
              if (patch.roundTotals !== undefined) setRoundTotals(patch.roundTotals);
              if (patch.vatType !== undefined) setVatType(patch.vatType as "regular" | "no_vat");
            }}
          />

          <div className="mb-[50px]">
            <div className="flex justify-between items-center">
              <h1 className="text-right">
                {documentLabel} {previewNumber || "---"}
              </h1>
            </div>
            {initial.companyName && <h2 className="text-right mt-[10px] mb-[40px]">{initial.companyName}</h2>}
          </div>

          <form className="ui-section-gap">
            <FormSection title="פרטי המסמך" description="">
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

            <FormSection title="רשימת פריטים" description="">
              <div ref={paymentsTableRef} className="space-y-[10px]">
                {Object.keys(itemErrors).length > 0 && (
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
                  <div className="px-[20px] sm:px-6 lg:px-8">
                    <div className="ui-item-grid ui-item-label font-semibold">
                      <div className="text-right pr-[20px] translate-y-[20px]">מק״ט</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">פירוט</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">כמות</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">מחיר ליחידה</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">מטבע</div>
                      {vatRate > 0 ? (
                        <div className="text-right pr-[20px] translate-y-[20px]">מע״מ</div>
                      ) : (
                        <div className="text-right opacity-0 pr-[20px] translate-y-[20px]" aria-hidden="true">
                          מע״מ
                        </div>
                      )}
                      <div className="text-right pr-[00px] translate-y-[20px]" ref={headerTotalRef}>
                        סה״כ
                      </div>
                      <div className="text-right pr-[-50px] translate-y-[20px]">אישור</div>
                    </div>
                  </div>
                  {items.map((row, i) => (
                    <div key={i}>
                      <div
                        className="relative w-full max-w-full px-[20px] sm:px-6 lg:px-8 py-6 ti-items-row"
                        data-payment-card="true"
                        data-locked={confirmedRows.has(i) ? "true" : "false"}
                      >
                        <div className="min-w-0">
                          <div className="ui-item-grid items-center">
                            <Input
                              value={row.sku}
                              onChange={(e) => updateItemRow(i, { sku: e.target.value })}
                              
                              className="ti-items-input text-right min-w-0"
                              disabled={confirmedRows.has(i)}
                            />
                            <Input
                              value={row.description}
                              onChange={(e) => {
                                updateItemRow(i, { description: e.target.value });
                                if (itemErrors[i]?.description && e.target.value.trim().length > 0) {
                                  const next = { ...itemErrors };
                                  if (next[i]) {
                                    delete next[i].description;
                                    if (Object.keys(next[i]).length === 0) delete next[i];
                                  }
                                  setItemErrors(next);
                                }
                              }}
                              placeholder="פירוט"
                              className={cn(
                                "ti-items-input text-right min-w-0",
                                itemErrors[i]?.description ? "border-danger focus-visible:ring-danger" : ""
                              )}
                              disabled={confirmedRows.has(i)}
                            />
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={Number.isFinite(row.quantity) ? row.quantity : ""}
                              onChange={(e) => {
                                const value = Number(e.target.value || 0);
                                updateItemRow(i, { quantity: value });
                                if (itemErrors[i]?.quantity && value > 0) {
                                  const next = { ...itemErrors };
                                  if (next[i]) {
                                    delete next[i].quantity;
                                    if (Object.keys(next[i]).length === 0) delete next[i];
                                  }
                                  setItemErrors(next);
                                }
                              }}
                              className={cn(
                                "ti-items-input text-right min-w-0",
                                itemErrors[i]?.quantity ? "border-danger focus-visible:ring-danger" : ""
                              )}
                              inputMode="numeric"
                              disabled={confirmedRows.has(i)}
                            />
                            <MoneyInput
                              className={cn(
                                "w-full min-w-0 text-right",
                                itemErrors[i]?.unitPrice ? "border-danger focus-visible:ring-danger" : "",
                                confirmedRows.has(i) ? "pointer-events-none" : ""
                              )}
                              variant="items"
                              value={row.unitPrice}
                              onChange={(v) => {
                                updateItemRow(i, { unitPrice: v });
                                if (itemErrors[i]?.unitPrice && v > 0) {
                                  const next = { ...itemErrors };
                                  if (next[i]) {
                                    delete next[i].unitPrice;
                                    if (Object.keys(next[i]).length === 0) delete next[i];
                                  }
                                  setItemErrors(next);
                                }
                              }}
                              currency={currency}
                            />
                            <Select
                              value={row.currency || currency}
                              disabled={currency !== "₪" || confirmedRows.has(i)}
                              onValueChange={(v) => updateItemRow(i, { currency: v })}
                            >
                              <SelectTrigger
                                variant="underline"
                                className={cn(
                                  "ti-items-select w-full min-w-0",
                                  itemErrors[i]?.currency ? "border-danger focus:border-danger" : ""
                                )}
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
                            {vatRate > 0 ? (
                              <Select
                                value={row.vatMode}
                                disabled={confirmedRows.has(i)}
                                onValueChange={(v) => updateItemRow(i, { vatMode: v as any })}
                              >
                                <SelectTrigger
                                  variant="underline"
                                  className="ti-items-select w-full min-w-0"
                                  aria-label="מע״מ"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="before">לפני</SelectItem>
                                  <SelectItem value="included">כולל</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="h-[50px]" aria-hidden="true" />
                            )}
                            <div
                              className="text-right text-[18px] font-regular"
                              ref={(el) => {
                                if (i === 0) itemTotalRef.current = el;
                              }}
                            >
                              {formatMoney(getLineTotal(row), row.currency || currency)}
                            </div>
                            <div className="flex items-center justify-center gap-2">
                              {confirmedRows.has(i) ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setConfirmedRows((prev) => {
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
                                </>
                              ) : (
                                <Button type="button" variant="default" onClick={() => confirmItemRow(i)}>
                                  אישור
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItemRow(i)}
                                disabled={items.length === 1}
                                title={items.length === 1 ? "חייב להיות לפחות פריט אחד" : "מחיקה"}
                                aria-label="מחיקה"
                                className="text-danger hover:text-danger hover:bg-danger/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {i < items.length - 1 ? (
                        <div className="h-px bg-[var(--muted-fg)] opacity-50 mx-[20px] sm:mx-6 lg:mx-8 mt-[15px]" />
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="flex items-start justify-between gap-6">
                  <div className="shrink-0 pr-[25px]" ref={addItemButtonRef}>
                    <Button type="button" onClick={addItemRow} variant="secondary">
                      הוספת פריט
                    </Button>
                  </div>

                  {hasConfirmedItems ? (
                    <div className="pt-[50px] mt-[-16px] flex-1 ml-[110px]" ref={summaryOuterRef}>
                      <div className="px-[20px] sm:px-6 lg:px-8">
                        <div className="ui-item-grid" ref={summaryBlockRef}>
                          <div className="col-span-8 self-start text-right text-[24px]   text-fg">
                            <div
                              className="ui-item-grid items-center"
                              ref={(el) => {
                                summaryRowRefs.current[0] = el;
                              }}
                            >
                              <div className="col-span-4" />
                            <div
                              className="col-span-2 text-right whitespace-nowrap"
                              ref={(el) => {
                                summaryLabelRefs.current[0] = el;
                              }}
                            >
                              סה״כ לפני מע״מ
                            </div>
                            <div
                              className="text-right mr-[55px] w-[calc(100%+50px)] -ml-[50px]"
                              ref={(el) => {
                                summaryValueContainerRefs.current[0] = el;
                              }}
                            >
                                <span
                                className="inline-block w-full text-right"
                                  ref={(el) => {
                                    summaryValueRefs.current[0] = el;
                                  }}
                                >
                                  {formatMoney(subtotal, currency)}
                                </span>
                              </div>
                              <div />
                            </div>
                            {vatRate > 0 ? (
                            <div
                              className="ui-item-grid items-center mt-[12px]"
                                ref={(el) => {
                                  summaryRowRefs.current[1] = el;
                                }}
                              >
                                <div className="col-span-4" />
                                <div
                                  className="col-span-2 text-right whitespace-nowrap"
                                  ref={(el) => {
                                    summaryLabelRefs.current[1] = el;
                                  }}
                                >
                                  מע״מ ({vatRate}%)
                                </div>
                                <div
                                  className="text-right mr-[55px] w-[calc(100%+50px)] -ml-[50px]"
                                  ref={(el) => {
                                    summaryValueContainerRefs.current[1] = el;
                                  }}
                                >
                                  <span
                                    className="inline-block w-full text-right"
                                    ref={(el) => {
                                      summaryValueRefs.current[1] = el;
                                    }}
                                  >
                                    {formatMoney(vatAmount, currency)}
                                  </span>
                                </div>
                                <div />
                              </div>
                            ) : null}
                          <div
                            className="ui-item-grid items-center mt-[12px] doc-totals-grand"
                            ref={(el) => {
                              summaryRowRefs.current[2] = el;
                            }}
                          >
                              <div className="col-span-4" />
                              <div
                                className="col-span-2 text-right whitespace-nowrap font-bold text-primary"
                                ref={(el) => {
                                  summaryLabelRefs.current[2] = el;
                                }}
                              >
                                סה״כ כולל מע״מ
                              </div>
                              <div
                                className="text-right mr-[55px] w-[calc(100%+50px)] -ml-[50px]"
                                ref={(el) => {
                                  summaryValueContainerRefs.current[2] = el;
                                }}
                              >
                                <span
                                className="inline-block w-full text-right font-bold text-primary"
                                  ref={(el) => {
                                    summaryValueRefs.current[2] = el;
                                  }}
                                >
                                  {formatMoney(total, currency)}
                                </span>
                              </div>
                              <div />
                            </div>
                          </div>
                        </div>
                      </div>
                      {roundTotals && (
                        <p className="text-xs mt-2 text-right text-muted-foreground">
                          כולל עיגול לסכום סופי
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </FormSection>

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
                  {/* Headers Row */}
                  <div className="px-[20px] sm:px-6 lg:px-8">
                    <div className="hidden md:grid md:grid-cols-[19.2%_13%_13%_80px_minmax(150px,36%)_1fr] gap-3 items-center font-semibold">
                      <div className="text-right pr-[20px] translate-y-[20px]">אמצעי תשלום</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">תאריך</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">סכום</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">מטבע</div>
                      <div className="text-right pr-[20px] translate-y-[20px]">פרטים נוספים</div>
                      <div className="text-right translate-y-[20px] pr-[30px]">פעולות</div>
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
                          <div className="hidden md:grid md:grid-cols-[19.2%_13%_13%_80px_minmax(150px,36%)_1fr] gap-3 items-center">
                            {/* אמצעי תשלום - 19.2% */}
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
                            <Input
                              type="date"
                              id={`payment-date-${i}`}
                              value={row.date}
                              onChange={(e) => updatePaymentRow(i, { date: e.target.value })}
                              className="ti-items-input text-right min-w-0"
                              disabled={confirmedPayments.has(i)}
                            />

                            {/* סכום - 13% */}
                            <MoneyInput
                              className={cn(
                                "w-full min-w-0 text-right",
                                paymentErrors[i]?.amount ? "border-danger focus-visible:ring-danger" : "",
                                confirmedPayments.has(i) ? "pointer-events-none" : ""
                              )}
                              variant="items"
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
                            />

                            {/* מטבע - 80px */}
                            <Select
                              value={row.currency || currency}
                              disabled={currency !== "₪" || confirmedPayments.has(i)}
                              onValueChange={(v) => updatePaymentRow(i, { currency: v })}
                            >
                              <SelectTrigger
                                variant="underline"
                                className="ti-items-select w-full min-w-0"
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
                            <div className="flex items-center justify-center gap-2">
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
                                <Button type="button" variant="default" onClick={() => confirmPaymentRow(i)}>
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
                            </div>

                            {/* תאריך */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">תאריך תשלום</label>
                              <Input
                                type="date"
                                id={`payment-date-mobile-${i}`}
                                value={row.date}
                                onChange={(e) => updatePaymentRow(i, { date: e.target.value })}
                                className="ti-items-input text-right w-full"
                                disabled={confirmedPayments.has(i)}
                              />
                            </div>

                            {/* סכום + מטבע - ביחד במובייל */}
                            <div className="w-full">
                              <label className="block text-sm text-muted-fg mb-2">סכום</label>
                              <div className="flex gap-3 items-center">
                                <MoneyInput
                                  className={cn(
                                    "flex-1 text-right",
                                    paymentErrors[i]?.amount ? "border-danger focus-visible:ring-danger" : "",
                                    confirmedPayments.has(i) ? "pointer-events-none" : ""
                                  )}
                                  variant="items"
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
                                />

                                <Select
                                  value={row.currency || currency}
                                  disabled={currency !== "₪" || confirmedPayments.has(i)}
                                  onValueChange={(v) => updatePaymentRow(i, { currency: v })}
                                >
                                  <SelectTrigger
                                    variant="underline"
                                    className="ti-items-select w-[80px] shrink-0"
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
                            </div>

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

                            {/* כפתורים */}
                            <div className="flex items-center justify-center gap-2 pt-2">
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
                                <Button type="button" variant="default" onClick={() => confirmPaymentRow(i)}>
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
                        סה״כ {formatMoney(payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0), currency)}
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
              documentType="invoiceReceipt"
              onClose={() => {
                window.location.href = basePath;
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
            documentType="invoiceReceipt"
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
                window.location.href = basePath === "/dashboard/documents" ? "/dashboard" : basePath;
              }}
              documentNumber={successModalData.documentNumber}
              companyName={successModalData.companyName}
              documentTypeLabel={successModalData.documentTypeLabel}
              documentId={successModalData.documentId}
              baseLanguage={successModalData.language}
              onViewDocument={async () => {
                window.location.href = `${basePath}/invoice-receipt/${successModalData.documentId}/summary`;
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
                  const url = window.URL.createObjectURL(pdfBlob);
                  const a = document.createElement("a");
                  a.href = url;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-he.pdf`;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);

                  toast.success("הקובץ הורד בהצלחה");
                } catch (error: any) {
                  console.error("Hebrew PDF download failed:", error);
                  toast.error(error.message || "שגיאה בהורדת PDF");
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
                  const url = window.URL.createObjectURL(pdfBlob);
                  const a = document.createElement("a");
                  a.href = url;
                  const baseName = successModalData.documentNumber || successModalData.documentId;
                  const fileName = issue === "original" ? `${baseName}.pdf` : `${baseName}-en.pdf`;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);

                  toast.success("File downloaded successfully");
                } catch (error: any) {
                  console.error("English PDF download failed:", error);
                  toast.error(error.message || "Failed to download PDF");
                }
              }}
            />
          )}

          {/* Totals Mismatch Warning Modal */}
          <div
            className={cn(
              "fixed inset-0 z-50 flex items-center justify-center transition-all duration-200",
              mismatchWarningOpen ? "visible opacity-100" : "invisible opacity-0"
            )}
            onClick={() => setMismatchWarningOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" />
            
            {/* Modal */}
            <div
              className="relative z-10 w-full max-w-md mx-4 bg-white rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
                    <span className="text-4xl">⚠️</span>
                  </div>
                </div>

                {/* Content */}
                <div className="text-center space-y-4">
                  <h3 className="text-xl font-semibold text-fg">
                    שים לב
                  </h3>
                  <p className="text-base text-fg/80 leading-relaxed">
                    הסכום הכולל של השירותים והפריטים חייב להיות זהה לסכום התקבולים
                  </p>
                  
                  {/* Totals Display */}
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-fg">סה״כ פריטים (כולל מע״מ):</span>
                      <span className="font-semibold text-fg">{formatMoney(total, currency)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-fg">סה״כ תקבולים:</span>
                      <span className="font-semibold text-fg">
                        {formatMoney(
                          payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0),
                          currency
                        )}
                      </span>
                    </div>
                    <div className="h-px bg-muted my-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-danger font-medium">הפרש:</span>
                      <span className="font-bold text-danger">
                        {formatMoney(
                          Math.abs(
                            total - payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0)
                          ),
                          currency
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Button */}
                <div className="mt-6">
                  <Button
                    onClick={() => setMismatchWarningOpen(false)}
                    className="w-full"
                    variant="default"
                  >
                    הבנתי
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
