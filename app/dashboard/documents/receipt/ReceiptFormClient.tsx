"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { InitialReceiptCreateData } from "./actions";
import type { PaymentRow, ReceiptDraftPayload } from "@/lib/types/receipt";
import { issueReceiptAction, saveReceiptDraftAction, updateReceiptDraftAction } from "./actions";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import PaymentDetailsSection from "./PaymentDetailsSection";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Save, CheckCircle, Settings as SettingsIcon, Trash2, Plus } from "lucide-react";

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

  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [customerNameError, setCustomerNameError] = useState<string | null>(null);
  const [paymentErrors, setPaymentErrors] = useState<{ [key: number]: string }>({});

  const [notes, setNotes] = useState("");

  // Refs for focus management
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLDivElement>(null);
  const paymentsTableRef = useRef<HTMLDivElement>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: "", date: todayYmd(), amount: 0, currency },
  ]);

  const [busy, setBusy] = useState<null | "draft" | "issue">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{
    receiptId: string;
    documentNumber: string;
    companyName: string;
    payload: ReceiptDraftPayload;
  } | null>(null);

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
  function focusFieldWithError(fieldRef: React.RefObject<HTMLElement>) {
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

  async function onSaveDraft() {
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});
    
    // Validation: Customer name is required
    if (!customerName || customerName.trim().length === 0) {
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      return;
    }
    
    // Validation: Description must be at least 5 characters
    if (!description || description.trim().length < 5) {
      setDescriptionError("התיאור חובה, לפחות 5 תווים");
      focusFieldWithError(descriptionInputRef);
      return;
    }
    
    // Validation: Check payment rows
    const errors: { [key: number]: string } = {};
    payments.forEach((payment, i) => {
      if (!payment.method) {
        errors[i] = "יש לבחור אמצעי תשלום";
      } else if (!payment.amount || payment.amount <= 0) {
        errors[i] = "סכום חייב להיות גדול מ-0";
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      focusFieldWithError(paymentsTableRef);
      return;
    }
    
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
        setMessage(result.message || "שגיאה בשמירת הטיוטה");
        setBusy(null);
        return;
      }
      
      // Success! Redirect to documents list
      window.location.href = "/dashboard/documents";
    } catch (error: any) {
      setMessage(error.message || "שגיאה בשמירת הטיוטה");
      setBusy(null);
    }
  }

  async function onIssue() {
    setMessage(null);
    setDescriptionError(null);
    setCustomerNameError(null);
    setPaymentErrors({});
    
    // Validation: Customer name is required
    if (!customerName || customerName.trim().length === 0) {
      setCustomerNameError("שם הלקוח הוא שדה חובה");
      focusFieldWithError(customerNameRef);
      return;
    }
    
    // Validation: Description must be at least 5 characters
    if (!description || description.trim().length < 5) {
      setDescriptionError("התיאור חובה, לפחות 5 תווים");
      focusFieldWithError(descriptionInputRef);
      return;
    }
    
    // Validation: Check payment rows
    const errors: { [key: number]: string } = {};
    payments.forEach((payment, i) => {
      if (!payment.method) {
        errors[i] = "יש לבחור אמצעי תשלום";
      } else if (!payment.amount || payment.amount <= 0) {
        errors[i] = "סכום חייב להיות גדול מ-0";
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      focusFieldWithError(paymentsTableRef);
      return;
    }
    
    // Prevent issue if sequence not locked
    if (!sequenceLocked) {
      setMessage("נדרש לבחור מספר התחלתי לפני הפקת מסמכים");
      setShowStartingNumberModal(true);
      return;
    }
    
    setBusy("issue");
    try {
      if (draftId && editData) {
        // Cannot issue from edit mode - must save first
        setMessage("יש לשמור את הטיוטה ולהפיק מהרשימה");
        setBusy(null);
        return;
      }
      
      console.log("Issuing receipt with payload:", payload);
      
      // Issue the receipt
      const result = await issueReceiptAction(payload);
      
      console.log("Issue result:", result);
      
      if (!result.ok) {
        setMessage(result.message || "שגיאה בהפקת המסמך");
        setBusy(null);
        return;
      }
      
      // Success! Show modal with options
      if (result.receiptId && result.documentNumber && result.companyName && result.payload) {
        setBusy(null);
        setSuccessModal({
          receiptId: result.receiptId,
          documentNumber: result.documentNumber,
          companyName: result.companyName,
          payload: result.payload,
        });
      }
    } catch (error: any) {
      console.error("Issue error:", error);
      setMessage(error.message || "שגיאה בהפקת המסמך");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-6 rounded-2xl border" style={{backgroundColor: '#1e293b', borderColor: '#334155'}}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black ui-text-dark">יצירת קבלה</h1>
              {previewNumber && (
                <p className="text-sm font-semibold" style={{color: '#60a5fa'}}>מספר תצוגה מקדימה: {previewNumber}</p>
              )}
            </div>
          </div>
        </div>

        <div className="text-left">
          <div className="font-bold ui-text-dark mb-2">{initial.companyName ?? "העסק שלי"}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen((v) => !v)}
            className="ui-button-dark-secondary"
          >
            <SettingsIcon className="h-4 w-4 ml-2" />
            הגדרות
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="ui-card-dark">
          <div className="mb-4">
            <h3 className="text-lg font-bold ui-text-dark mb-1">הגדרות מסמך</h3>
            <p className="text-sm ui-text-dark-muted">התאם את ברירות המחדל למסמך זה</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FieldWrapper label="שפה">
              <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="he">עברית</SelectItem>
                  <SelectItem value="en">אנגלית</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="מטבע ברירת מחדל">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
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
            </FieldWrapper>

            <FieldWrapper label="עיגול סכומים">
              <label className="flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors" style={{backgroundColor: '#0f172a'}}>
                <input
                  type="checkbox"
                  checked={roundTotals}
                  onChange={(e) => setRoundTotals(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm ui-text-dark-muted">עיגול למטבע שלם</span>
              </label>
            </FieldWrapper>
          </div>
        </div>
      )}

      {/* Customer Details */}
      <div className="ui-card-dark">
        <div className="mb-4">
          <h3 className="text-lg font-bold ui-text-dark mb-1">פרטי לקוח</h3>
          <p className="text-sm ui-text-dark-muted">בחר לקוח קיים או הזן שם חדש</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper 
            label="שם לקוח" 
            required 
            error={customerNameError}
            id="customerName"
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

          <FieldWrapper label="תאריך מסמך" required id="documentDate">
            <Input
              id="documentDate"
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              min={minAllowedDate || undefined}
              aria-required="true"
            />
          </FieldWrapper>
        </div>
      </div>

      {/* Document Details */}
      <div className="ui-card-dark">
        <div className="mb-4">
          <h3 className="text-lg font-bold ui-text-dark mb-1">פרטי המסמך</h3>
          <p className="text-sm ui-text-dark-muted">תיאור התשלום או השירות</p>
        </div>
        <FieldWrapper 
          label="תיאור" 
          required 
          error={descriptionError}
          id="description"
          hint="מינימום 5 תווים - לדוגמה: שירותי עיצוב גרפי"
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
            className={descriptionError ? "border-red-500" : ""}
            aria-required="true"
            aria-invalid={!!descriptionError}
            aria-describedby={descriptionError ? "description-error" : "description-hint"}
          />
        </FieldWrapper>
      </div>

      {/* Payments Section */}
      <div className="ui-card-dark">
        <div className="mb-4">
          <h3 className="text-lg font-bold ui-text-dark mb-1">פירוט תקבולים</h3>
          <p className="text-sm ui-text-dark-muted">איך שילמו לך? אפשר לבחור מספר צורות תשלום שונות</p>
        </div>
        
        <div ref={paymentsTableRef}>
          {Object.keys(paymentErrors).length > 0 && (
            <div className="p-3 ui-alert-dark-danger rounded-lg flex items-center gap-2 text-sm font-semibold mb-4">
              <span>⚠️</span>
              <span>יש לתקן את השדות המסומנים באדום</span>
            </div>
          )}

          <div className="space-y-3">
            {payments.map((row, i) => (
              <div key={i} className="relative p-4 pt-12 rounded-xl border" style={{backgroundColor: '#0f172a', borderColor: '#334155'}}>
                {/* Delete Button - Icon Only, Absolutely Positioned */}
                <button
                  type="button"
                  onClick={() => removePaymentRow(i)}
                  disabled={payments.length === 1}
                  aria-label="מחיקה"
                  className="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-md text-red-300 hover:text-red-200 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  title="מחק"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>

                <div className="grid gap-3 md:grid-cols-3">
                  <FieldWrapper 
                    label="אמצעי תשלום" 
                    required
                    error={paymentErrors[i]}
                    id={`payment-method-${i}`}
                  >
                    <Select
                      value={row.method}
                      onValueChange={(v) => {
                        updatePaymentRow(i, { method: v as any });
                        if (paymentErrors[i]) {
                          const newErrors = { ...paymentErrors };
                          delete newErrors[i];
                          setPaymentErrors(newErrors);
                        }
                      }}
                    >
                      <SelectTrigger 
                        id={`payment-method-${i}`}
                        className={paymentErrors[i] ? "border-red-500" : ""}
                        aria-required="true"
                        aria-invalid={!!paymentErrors[i]}
                        aria-describedby={paymentErrors[i] ? `payment-method-${i}-error` : undefined}
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
                  </FieldWrapper>

                  <FieldWrapper label="תאריך תשלום" required id={`payment-date-${i}`}>
                    <Input
                      id={`payment-date-${i}`}
                      type="date"
                      value={row.date}
                      onChange={(e) => updatePaymentRow(i, { date: e.target.value })}
                      min={minAllowedDate || undefined}
                      aria-required="true"
                    />
                  </FieldWrapper>

                  <FieldWrapper 
                    label="סכום" 
                    required
                    id={`payment-amount-${i}`}
                  >
                    <div className="flex gap-2">
                      <MoneyInput
                        id={`payment-amount-${i}`}
                        value={row.amount}
                        onChange={(v) => {
                          updatePaymentRow(i, { amount: v });
                          if (paymentErrors[i] && v > 0) {
                            const newErrors = { ...paymentErrors };
                            delete newErrors[i];
                            setPaymentErrors(newErrors);
                          }
                        }}
                        currency={row.currency}
                        error={!!paymentErrors[i]}
                        className="flex-1"
                        aria-required="true"
                        aria-invalid={!!paymentErrors[i]}
                      />
                      <Select
                        value={row.currency}
                        onValueChange={(v) => updatePaymentRow(i, { currency: v })}
                      >
                        <SelectTrigger className="w-28" aria-label="מטבע">
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
                  </FieldWrapper>
                </div>

                <div className="mt-3">
                  <PaymentDetailsSection
                    payment={row}
                    onUpdate={(updates) => updatePaymentRow(i, updates)}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addPaymentRow}
            className="w-full border-dashed border-2 ui-button-dark-secondary mt-5"
          >
            <Plus className="h-4 w-4 ml-2" />
            הוספת תקבול
          </Button>

          <div className="pt-4 border-t-2" style={{borderColor: '#334155'}}>
            <div className="flex justify-between items-center">
              <div className="text-lg font-black ui-text-dark">סה״כ שולם</div>
              <div className="text-2xl font-black" style={{color: '#60a5fa'}}>{formatMoney(total, currency)}</div>
            </div>
            {roundTotals && (
              <p className="text-xs ui-text-dark-muted mt-1 text-left">כולל עיגול לסכום סופי</p>
            )}
          </div>
        </div>
      </div>

      {/* Notes Section */}
      <div className="ui-card-dark">
        <div className="mb-4">
          <h3 className="text-lg font-bold ui-text-dark mb-1">הערות</h3>
          <p className="text-sm ui-text-dark-muted">הערות שיופיעו במסמך הסופי</p>
        </div>
        <FieldWrapper 
          label="הערות נוספות" 
          id="notes"
          hint="הערות אלו יופיעו במסמך הסופי שישלח ללקוח"
        >
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="לדוגמה: תודה על העסקה..."
            className="min-h-[100px] resize-y"
            aria-describedby="notes-hint"
          />
        </FieldWrapper>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap sticky bottom-0 p-4 rounded-xl border shadow-lg" style={{backgroundColor: '#1e293b', borderColor: '#334155'}}>
        <Button
          type="button"
          variant="outline"
          onClick={onSaveDraft}
          disabled={busy != null}
          className="flex-1 min-w-[200px] ui-button-dark-secondary"
        >
          {busy === "draft" ? (
            <>שומר בטיוטות...</>
          ) : (
            <>
              <Save className="h-4 w-4 ml-2" />
              שמירה בטיוטות
            </>
          )}
        </Button>

        <Button
          type="button"
          onClick={onIssue}
          disabled={busy != null || !sequenceLocked}
          className="flex-1 min-w-[200px] ui-button-dark"
          title={!sequenceLocked ? "נדרש לבחור מספר התחלתי" : ""}
        >
          {busy === "issue" ? (
            <>יוצר קבלה...</>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 ml-2" />
              יצירת קבלה
            </>
          )}
        </Button>
      </div>

      {/* Message Alert */}
      {message && (
        <div 
          className={`p-4 rounded-xl border font-medium ${
            message.includes("שגיאה")
              ? "ui-alert-dark-danger"
              : "ui-alert-dark-success"
          }`}
        >
          {message.includes("שגיאה") && "⚠️ "}
          {message}
        </div>
      )}

      {/* Footer Text from Admin Settings */}
      {footerText && footerText.trim() && (
        <div className="p-4 ui-card-dark rounded-xl">
          <div className="font-bold text-sm mb-2 ui-text-dark">📌 הערות מערכת</div>
          <div className="text-sm ui-text-dark-muted whitespace-pre-wrap leading-relaxed">
            {footerText}
          </div>
        </div>
      )}

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

      {/* Success Modal - Receipt Created Successfully */}
      {successModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => {
            setSuccessModal(null);
            window.location.href = "/dashboard/documents";
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 40,
              maxWidth: 500,
              width: "90%",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Success Icon */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>

            {/* Title */}
            <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12, color: "#111827" }}>
              יצרת בהצלחה קבלה!
            </h2>

            {/* Receipt Number */}
            <div style={{ fontSize: 18, color: "#6b7280", marginBottom: 32 }}>
              מספר קבלה: <strong style={{ color: "#111827" }}>{successModal.documentNumber}</strong>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                onClick={() => {
                  // Open preview page with auto-download enabled
                  const previewData = {
                    previewNumber: successModal.documentNumber,
                    companyName: successModal.companyName,
                    customerName: successModal.payload.customerName,
                    customerId: successModal.payload.customerId || "",
                    documentDate: successModal.payload.documentDate,
                    description: successModal.payload.description || "",
                    notes: successModal.payload.notes,
                    footerNotes: successModal.payload.notes,
                    total: String(successModal.payload.total),
                    currency: successModal.payload.currency,
                    payments: JSON.stringify(successModal.payload.payments),
                    autoDownload: "true", // Trigger auto-download
                  };
                  
                  const params = new URLSearchParams(previewData as any);
                  window.open(`/dashboard/documents/receipt/preview?${params.toString()}`, "_blank");
                  
                  // Close modal and redirect after short delay
                  setTimeout(() => {
                    setSuccessModal(null);
                    window.location.href = "/dashboard/documents";
                  }, 1000);
                }}
                style={{
                  padding: "16px 32px",
                  borderRadius: 12,
                  border: "none",
                  background: "#111827",
                  color: "white",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                הורדת קבלה (PDF)
              </button>

              <button
                onClick={() => {
                  setSuccessModal(null);
                  window.location.href = "/dashboard/documents";
                }}
                style={{
                  padding: "16px 32px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  background: "white",
                  color: "#374151",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                סגירה
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
