"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type {
  InitialDocumentCreateData,
  DocumentDraftPayload,
  DocumentIssueType,
} from "@/lib/documents/actions";
import {
  issueDocumentAction,
  saveDocumentDraftAction,
  updateDocumentDraftAction,
  getRecipientConsentStatusAction,
  giveRecipientConsentAction,
  revokeRecipientConsentAction,
  getDocumentForChainingAction,
} from "@/lib/documents/actions";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import ReceiptPreviewModal from "@/components/documents/ReceiptPreviewModal";
import ReceiptConfirmationModal from "@/components/documents/ReceiptConfirmationModal";
import ReceiptSuccessModal from "@/components/documents/ReceiptSuccessModal";
import ReceiptSettingsSummary from "@/components/documents/receipt/ReceiptSettingsSummary";
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
import { createDocumentLinkAction } from "@/lib/documents/actions";

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

function endOfMonthYmd(isoYmd: string): string {
  // Expect YYYY-MM-DD
  const parts = String(isoYmd || "").split("-");
  const year = Number(parts[0] || 0);
  const month = Number(parts[1] || 0); // 1-12
  if (!Number.isFinite(year) || !Number.isFinite(month) || year < 1900 || month < 1 || month > 12) {
    return isoYmd;
  }
  // Day 0 of next month gives last day of current month.
  const last = new Date(year, month, 0);
  const mm = String(month).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function formatMoney(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currency}`;
}

export default function TaxInvoiceFormClient({
  initial,
  documentType = "tax_invoice",
  footerText,
  editData,
  draftId,
}: {
  initial: InitialDocumentCreateData;
  documentType?: DocumentIssueType;
  footerText?: string;
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
  const searchParams = useSearchParams();
  const documentConfig = useMemo(() => getDocumentConfig(documentType), [documentType]);
  const documentLabel = documentConfig?.label || "חשבונית מס";
  const basePath = documentConfig?.category === "business" ? "/business/documents" : "/dashboard/documents";
  const digitalSignaturesEnabled = isDigitalSignaturesEnabledClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showDueDate = documentType === "tax_invoice" || documentType === "deliveryNote";

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);

  const effectiveDraftId = useMemo(() => {
    if (draftId) return draftId
    if (initial.ok && initial.draftId) return initial.draftId
    return undefined
  }, [draftId, initial])

  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["₪", "$", "€"]
  );
  const [currency, setCurrency] = useState<string>(initial.ok ? initial.settings.defaultCurrency : "₪");
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
  const [dueDate, setDueDate] = useState(endOfMonthYmd(todayYmd()));
  const [dueDateAuto, setDueDateAuto] = useState(true);
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [chainSourceDocumentId, setChainSourceDocumentId] = useState<string | null>(null);
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
      setDueDateAuto(false);
      setCurrency(editData.currency);
      setNotes(editData.notes);
      if (editData.vatType) setVatType(editData.vatType);
    }
  }, [editData]);


  // Optional prefill from URL params (UI only; no DB logic changes)
  useEffect(() => {
    if (editData || draftId) return;
    const prefillCustomerId = searchParams.get("customerId");
    const prefillCustomerName = searchParams.get("customerName");
    const prefillNotes = searchParams.get("notes");
    const prefillSourceDocumentId = searchParams.get("sourceDocumentId");

    if (prefillCustomerId) setCustomerId(prefillCustomerId);
    if (prefillCustomerName) setCustomerName(prefillCustomerName);
    if (prefillNotes) setNotes(prefillNotes);
    if (prefillSourceDocumentId) {
      setChainSourceDocumentId(prefillSourceDocumentId);
      // Load items from source document
      getDocumentForChainingAction(prefillSourceDocumentId).then((res) => {
        if (res.ok && res.document.items && res.document.items.length > 0) {
          const loadedItems = res.document.items.map(item => ({
            label: item.label,
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            currency: item.currency,
            vatMode: item.vatMode,
          }));
          
          setItems(loadedItems);
          
          // Mark all loaded items as confirmed
          setConfirmedRows(new Set(loadedItems.map((_, idx) => idx)));
        }
      });
    }
  }, [searchParams, editData, draftId]);

  useEffect(() => {
    if (!showDueDate) return;
    if (dueDateAuto) {
      const next = endOfMonthYmd(documentDate);
      if (next && next !== dueDate) setDueDate(next);
      return;
    }
    if (dueDate < documentDate) {
      setDueDate(documentDate);
    }
  }, [documentDate, dueDate, dueDateAuto, showDueDate]);

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

  const payload: DocumentDraftPayload = useMemo(() => {
    return {
      documentType,
      customerName,
      customerId,
      documentDate,
      paymentDueDate: showDueDate ? dueDate : "",
      description,
      payments: [],
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
    showDueDate,
    dueDate,
  ]);

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
        paymentDueDate: showDueDate ? dueDate || documentDate || todayYmd() : "",
        description: description || "",
        notes: notes || "",
        footerNotes: footerText || "",
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

      const routeSegment = documentConfig?.routeSegment || "tax-invoice";
      setPreviewPdfUrl(`${basePath}/${routeSegment}/preview?${params.toString()}`);
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

    setBusy("draft");
    try {
      let result;
      // For locked sequences, the server pre-creates a reserved draftId. Always update that draft if present.
      if (effectiveDraftId) result = await updateDocumentDraftAction(documentType, effectiveDraftId, payload);
      else result = await saveDocumentDraftAction(documentType, payload);

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
      const result = await issueDocumentAction(documentType, payload, effectiveDraftId);

      if (!result || !result.ok) {
        toast.error(result?.message || "הפקת המסמך נכשלה - שגיאה לא ידועה");
        setBusy(null);
        setIsFinalizing(false);
        return;
      }

      setConfirmationModalOpen(false);
      setBusy(null);

      if (chainSourceDocumentId) {
        // Fetch source document to check if we should create payment link
        const sourceDoc = await getDocumentForChainingAction(chainSourceDocumentId);
        
        let linkType: "related" | "payment" = "related";
        let linkAmount = 0;
        
        // If this is invoice-receipt and amounts match, treat as payment to close source
        if (
          documentType === "invoiceReceipt" &&
          sourceDoc.ok &&
          sourceDoc.document.totalAmount &&
          Math.abs(total - sourceDoc.document.totalAmount) < 0.01
        ) {
          linkType = "payment";
          linkAmount = total;
        }
        
        const note = notes ? `שרשור: ${notes}` : null;
        const linkRes = await createDocumentLinkAction({
          sourceDocumentId: chainSourceDocumentId,
          targetDocumentId: result.documentId,
          linkType,
          amount: linkAmount,
          note,
        });
        if (!linkRes.ok) {
          toast.error(linkRes.message || "השרשור נכשל: לא ניתן ליצור קשר בין המסמכים");
        }
      }

      setSuccessModalData({
        documentId: result.documentId,
        documentNumber: result.documentNumber || "",
        companyName: result.companyName || "העסק שלי",
        documentTypeLabel: documentLabel,
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
                      const next = minAllowedDate && value < minAllowedDate ? minAllowedDate : value;
                      setDocumentDate(next);
                      if (showDueDate && dueDateAuto) {
                        setDueDate(endOfMonthYmd(next));
                      }
                    }}
                    min={minAllowedDate || undefined}
                    containerClassName="w-full min-w-0 ui-document-date-offset"
                  />
                  {showDueDate ? (
                    <FloatingDateInput
                      label="תשלום עד"
                      required
                      id="dueDate"
                      value={dueDate}
                      onChange={(value) => {
                        setDueDateAuto(false);
                        if (value < documentDate) setDueDate(documentDate);
                        else setDueDate(value);
                      }}
                      min={documentDate || undefined}
                      containerClassName="w-full min-w-0 ui-document-date-offset"
                    />
                  ) : null}
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
                      <div className="text-right pr-[12px] translate-y-[20px]">מק״ט</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">פירוט</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">כמות</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">מחיר ליחידה</div>
                      <div className="text-right pr-[12px] translate-y-[20px]">מטבע</div>
                      {vatRate > 0 ? (
                        <div className="text-right pr-[12px] translate-y-[20px]">מע״מ</div>
                      ) : (
                        <div className="ti-items-only-desktop text-right opacity-0 pr-[12px] translate-y-[20px]" aria-hidden="true">
                          מע״מ
                        </div>
                      )}
                      <div className="text-right pr-[12px] translate-y-[20px]" ref={headerTotalRef}>
                        סה״כ
                      </div>
                      <div className="text-right pr-[-50px] translate-y-[20px] ui-items-actions-label-offset">
                        אישור
                      </div>
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
                            <div className="ti-items-group ti-items-group--sku-desc">
                              <div className="ti-items-field" data-label="מק״ט">
                                <Input
                                  value={row.sku}
                                  onChange={(e) => updateItemRow(i, { sku: e.target.value })}
                                  className="ti-items-input text-right min-w-0"
                                  disabled={confirmedRows.has(i)}
                                />
                              </div>
                              <div className="ti-items-field" data-label="פירוט">
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
                              </div>
                              <div className="ti-items-field" data-label="כמות">
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
                              </div>
                            </div>

                            <div className="ti-items-group ti-items-group--qty-price-currency">
                              <div className="ti-items-currency-amount">
                                <div className="ti-items-field ti-items-amount min-w-0" data-label="מחיר ליחידה">
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
                                </div>
                                <div className="ti-items-field ti-items-currency ti-items-hide-label min-w-0" data-label="מטבע">
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
                                </div>
                              </div>
                            </div>

                            <div className={cn("ti-items-group ti-items-group--vat-total", vatRate === 0 ? "ti-items-group--vat-hidden" : "")}>
                              {vatRate > 0 ? (
                                <div className="ti-items-field" data-label="מע״מ">
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
                                </div>
                              ) : (
                                <div className="ti-items-field ti-items-field-empty ti-items-only-desktop" aria-hidden="true">
                                  <div className="h-[50px]" />
                                </div>
                              )}
                            </div>

                            <div className="ti-items-group ti-items-group--total-actions">
                              <div className="ti-items-field ti-items-total-display" data-label="סה״כ">
                                <div
                                  className="text-right text-[18px] font-regular whitespace-nowrap"
                                  ref={(el) => {
                                    if (i === 0) itemTotalRef.current = el;
                                  }}
                                >
                                  {formatMoney(getLineTotal(row), row.currency || currency)}
                                </div>
                              </div>

                              <div
                                className="ti-items-field ti-items-actions ti-items-hide-label flex items-center justify-end gap-2 ui-items-actions-offset"
                                data-label="אישור"
                              >
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
              documentType={documentType}
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
            documentType={documentType}
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
                const routeSegment = documentConfig?.routeSegment || "tax-invoice";
                window.location.href = `${basePath}/${routeSegment}/${successModalData.documentId}/summary`;
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
