"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type {
  InitialInvoiceReceiptCreateData,
  InvoiceReceiptDraftPayload,
  InvoiceReceiptItemRow,
  PaymentRow,
} from "./actions";
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
  const documentLabel = documentConfig?.label || "חשבונית מס/קבלה";
  const basePath = "/dashboard/documents";
  const digitalSignaturesEnabled = isDigitalSignaturesEnabledClient();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : true);
  const [showStartingNumberModal, setShowStartingNumberModal] = useState(false);

  const minAllowedDate = initial.ok ? initial.minAllowedDate : null;

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [showSku, setShowSku] = useState<boolean>(initial.ok ? initial.settings.showSku : false);
  const [showItemDescription, setShowItemDescription] = useState<boolean>(
    initial.ok ? initial.settings.showItemDescription : false
  );
  const [signatureUrl, setSignatureUrl] = useState<string>(initial.ok ? initial.settings.signatureUrl : "");
  const [signature2Url, setSignature2Url] = useState<string>(initial.ok ? initial.settings.signature2Url : "");
  const [customerSelectedId, setCustomerSelectedId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [taxIdNumber, setTaxIdNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("");
  const [documentDate, setDocumentDate] = useState(editData?.documentDate || todayYmd());
  const [paymentDueDate, setPaymentDueDate] = useState(editData?.paymentDueDate || "");
  const [notes, setNotes] = useState(editData?.notes || "");
  const [items, setItems] = useState<InvoiceReceiptItemRow[]>([
    {
      label: "",
      sku: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      currency: initial.ok ? initial.settings.currency : "ILS",
      vatMode: "before",
    },
  ]);
  const [vatType, setVatType] = useState<"regular" | "no_vat">(
    editData?.vatType || (initial.ok ? initial.settings.vatType : "regular")
  );
  const [vatRate, setVatRate] = useState<number>(
    editData?.vatRate || (initial.ok ? initial.settings.vatRate : 17)
  );
  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: "cash", amount: 0, checkNumber: "", refNumber: "" },
  ]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successDocumentId, setSuccessDocumentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConsentGiven, setIsConsentGiven] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currency = initial.ok ? initial.settings.currency : "ILS";

  useEffect(() => {
    if (!initial.ok) return;
    const load = async () => {
      const consent = await getRecipientConsentStatusAction();
      if (consent.ok && consent.consentGiven) {
        setIsConsentGiven(true);
      }
    };
    load();
  }, [initial.ok]);

  const subtotal = useMemo(() => {
    const sum = items.reduce((acc, it) => {
      const rowTotal = it.quantity * it.unitPrice;
      return acc + rowTotal;
    }, 0);
    return roundTotals ? Math.round(sum) : sum;
  }, [items, roundTotals]);

  const vatAmount = useMemo(() => {
    if (vatType === "no_vat") return 0;
    const vat = (subtotal * vatRate) / 100;
    return roundTotals ? Math.round(vat) : vat;
  }, [vatType, subtotal, vatRate, roundTotals]);

  const total = useMemo(() => {
    const sum = subtotal + vatAmount;
    return roundTotals ? Math.round(sum) : sum;
  }, [subtotal, vatAmount, roundTotals]);

  const totalPayments = useMemo(() => {
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        label: "",
        sku: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        currency,
        vatMode: "before",
      },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: keyof InvoiceReceiptItemRow, value: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const handleAddPayment = () => {
    setPayments([...payments, { method: "cash", amount: 0, checkNumber: "", refNumber: "" }]);
  };

  const handleRemovePayment = (idx: number) => {
    setPayments(payments.filter((_, i) => i !== idx));
  };

  const handlePaymentChange = (idx: number, field: keyof PaymentRow, value: any) => {
    setPayments(payments.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const handleCustomerSelect = useCallback((customer: any) => {
    setCustomerSelectedId(customer.id);
    setCustomerName(customer.name || "");
    setTaxIdNumber(customer.taxIdNumber || "");
    setEmail(customer.email || "");
    setAddress(customer.address || "");
    setCity(customer.city || "");
    setZipCode(customer.zipCode || "");
    setCountry(customer.country || "");
  }, []);

  const handleQuickAddSuccess = useCallback((newCust: any) => {
    handleCustomerSelect(newCust);
    setQuickAddOpen(false);
  }, [handleCustomerSelect]);

  const buildPayload = (): InvoiceReceiptDraftPayload => {
    return {
      documentType: "invoiceReceipt",
      customerName,
      taxIdNumber,
      email,
      address,
      city,
      zipCode,
      country,
      documentDate,
      paymentDueDate: paymentDueDate || undefined,
      total,
      currency,
      notes,
      items: items.map((it) => ({
        ...it,
        lineTotal: it.quantity * it.unitPrice,
      })),
      vatType,
      vatRate,
      vatAmount,
      subtotal,
      payments: payments.filter((p) => p.amount > 0),
      settings: {
        language,
        roundTotals,
        showSku,
        showItemDescription,
        signatureUrl,
        signature2Url,
        currency,
        vatType,
        vatRate,
      },
    };
  };

  const handleSaveDraft = async () => {
    try {
      setIsSubmitting(true);
      const payload = buildPayload();
      const result = draftId
        ? await updateInvoiceReceiptDraftAction(draftId, payload)
        : await saveInvoiceReceiptDraftAction(payload);

      if (!result.ok) {
        toast.error(result.error || "שגיאה בשמירת טיוטה");
        return;
      }

      toast.success("טיוטה נשמרה");
      if (!draftId) {
        window.location.href = `${basePath}?draftId=${result.draftId}`;
      }
    } catch (err: any) {
      toast.error(err.message || "שגיאה בשמירת טיוטה");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreview = () => {
    setShowPreview(true);
  };

  const handleIssue = async () => {
    if (!isConsentGiven && digitalSignaturesEnabled) {
      setShowConfirmation(true);
      return;
    }
    await doIssue();
  };

  const doIssue = async () => {
    try {
      setIsSubmitting(true);
      const payload = buildPayload();
      const result = await issueInvoiceReceiptAction(payload);

      if (!result.ok) {
        toast.error(result.error || "שגיאה בהפקה");
        return;
      }

      setSuccessDocumentId(result.documentId!);
      setShowSuccess(true);
    } catch (err: any) {
      toast.error(err.message || "שגיאה בהפקה");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGiveConsent = async () => {
    const res = await giveRecipientConsentAction();
    if (res.ok) {
      setIsConsentGiven(true);
      setShowConfirmation(false);
      await doIssue();
    } else {
      toast.error("שגיאה בהסכמה");
    }
  };

  const handleRevokeConsent = async () => {
    const res = await revokeRecipientConsentAction();
    if (res.ok) {
      setIsConsentGiven(false);
      toast.success("ההסכמה בוטלה");
    }
  };

  if (!initial.ok) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">{initial.error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{documentLabel} חדש</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={isSubmitting}>
            <Save className="h-4 w-4 ml-2" />
            שמירת טיוטה
          </Button>
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="h-4 w-4 ml-2" />
            תצוגה מקדימה
          </Button>
          <Button onClick={handleIssue} disabled={isSubmitting}>
            הפקה
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <FormSection title="פרטי לקוח">
            <div className="space-y-4">
              <CustomerAutocomplete
                onSelect={handleCustomerSelect}
                onQuickAdd={() => setQuickAddOpen(true)}
              />
              <FloatingInput
                id="customerName"
                label="שם לקוח"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
              <FloatingInput
                id="taxIdNumber"
                label="ח.פ / ע.מ"
                value={taxIdNumber}
                onChange={(e) => setTaxIdNumber(e.target.value)}
              />
              <FloatingInput
                id="email"
                label="אימייל"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FloatingInput
                id="address"
                label="כתובת"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-4">
                <FloatingInput
                  id="city"
                  label="עיר"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <FloatingInput
                  id="zipCode"
                  label="מיקוד"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                />
                <FloatingInput
                  id="country"
                  label="מדינה"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="פרטי מסמך">
            <div className="grid grid-cols-2 gap-4">
              <FloatingDateInput
                id="documentDate"
                label="תאריך מסמך"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
                min={minAllowedDate || undefined}
                required
              />
              <FloatingDateInput
                id="paymentDueDate"
                label="תאריך לתשלום"
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
              />
            </div>
          </FormSection>

          <FormSection title="פריטים">
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={idx} className="p-4 border rounded-lg space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">פריט {idx + 1}</span>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FloatingInput
                      id={`item-${idx}-label`}
                      label="שם פריט"
                      value={item.label}
                      onChange={(e) => handleItemChange(idx, "label", e.target.value)}
                      required
                    />
                    {showSku && (
                      <FloatingInput
                        id={`item-${idx}-sku`}
                        label='מק"ט'
                        value={item.sku}
                        onChange={(e) => handleItemChange(idx, "sku", e.target.value)}
                      />
                    )}
                  </div>
                  {showItemDescription && (
                    <FloatingTextarea
                      id={`item-${idx}-description`}
                      label="תיאור"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                    />
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <FloatingInput
                      id={`item-${idx}-quantity`}
                      label="כמות"
                      type="number"
                      min="0"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, "quantity", parseFloat(e.target.value) || 0)}
                      required
                    />
                    <MoneyInput
                      id={`item-${idx}-unitPrice`}
                      label="מחיר יחידה"
                      value={item.unitPrice}
                      onChange={(val) => handleItemChange(idx, "unitPrice", val)}
                      currency={currency}
                      required
                    />
                    <div className="flex items-center justify-center">
                      <span className="text-sm font-medium">
                        סה"כ: {formatMoney(item.quantity * item.unitPrice, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={handleAddItem}>
                הוסף פריט
              </Button>
            </div>
          </FormSection>

          <FormSection title="מע״מ">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">סוג מע״מ</label>
                <Select value={vatType} onValueChange={(v: any) => setVatType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">רגיל</SelectItem>
                    <SelectItem value="no_vat">ללא מע״מ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {vatType === "regular" && (
                <FloatingInput
                  id="vatRate"
                  label="אחוז מע״מ"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={vatRate}
                  onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                />
              )}
            </div>
          </FormSection>

          <FormSection title="פרטי תשלום">
            <div className="space-y-4">
              {payments.map((payment, idx) => (
                <div key={idx} className="p-4 border rounded-lg space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">אמצעי תשלום {idx + 1}</span>
                    {payments.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePayment(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">אמצעי תשלום</label>
                      <Select
                        value={payment.method}
                        onValueChange={(v: any) => handlePaymentChange(idx, "method", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">מזומן</SelectItem>
                          <SelectItem value="check">המחאה</SelectItem>
                          <SelectItem value="credit">אשראי</SelectItem>
                          <SelectItem value="bank_transfer">העברה בנקאית</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <MoneyInput
                      id={`payment-${idx}-amount`}
                      label="סכום"
                      value={payment.amount}
                      onChange={(val) => handlePaymentChange(idx, "amount", val)}
                      currency={currency}
                      required
                    />
                  </div>
                  {payment.method === "check" && (
                    <FloatingInput
                      id={`payment-${idx}-checkNumber`}
                      label="מספר המחאה"
                      value={payment.checkNumber}
                      onChange={(e) => handlePaymentChange(idx, "checkNumber", e.target.value)}
                    />
                  )}
                  {(payment.method === "credit" || payment.method === "bank_transfer") && (
                    <FloatingInput
                      id={`payment-${idx}-refNumber`}
                      label="מספר אסמכתא"
                      value={payment.refNumber}
                      onChange={(e) => handlePaymentChange(idx, "refNumber", e.target.value)}
                    />
                  )}
                </div>
              ))}
              <Button variant="outline" onClick={handleAddPayment}>
                הוסף אמצעי תשלום
              </Button>
            </div>
          </FormSection>

          <FormSection title="הערות">
            <FloatingTextarea
              id="notes"
              label="הערות נוספות"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </FormSection>

          <Card className="bg-muted">
            <CardContent className="pt-6">
              <div className="space-y-2 text-lg">
                <div className="flex justify-between">
                  <span>סכום לפני מע״מ:</span>
                  <span className="font-medium">{formatMoney(subtotal, currency)}</span>
                </div>
                {vatType === "regular" && (
                  <div className="flex justify-between">
                    <span>מע״מ ({vatRate}%):</span>
                    <span className="font-medium">{formatMoney(vatAmount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>סה״כ:</span>
                  <span>{formatMoney(total, currency)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold">
                  <span>שולם:</span>
                  <span>{formatMoney(totalPayments, currency)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>יתרה:</span>
                  <span className={totalPayments < total ? "text-red-600" : "text-green-600"}>
                    {formatMoney(total - totalPayments, currency)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {quickAddOpen && (
        <QuickAddCustomerModal
          onClose={() => setQuickAddOpen(false)}
          onSuccess={handleQuickAddSuccess}
        />
      )}

      {showPreview && (
        <ReceiptPreviewModal
          onClose={() => setShowPreview(false)}
          payload={buildPayload()}
          documentType="invoiceReceipt"
        />
      )}

      {showConfirmation && (
        <ReceiptConfirmationModal
          onClose={() => setShowConfirmation(false)}
          onConfirm={handleGiveConsent}
          onDecline={async () => {
            setShowConfirmation(false);
            await doIssue();
          }}
        />
      )}

      {showSuccess && (
        <ReceiptSuccessModal
          documentId={successDocumentId}
          documentType="invoiceReceipt"
          onClose={() => {
            setShowSuccess(false);
            window.location.href = basePath;
          }}
        />
      )}
    </div>
  );
}
