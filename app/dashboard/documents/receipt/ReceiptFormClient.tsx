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
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { FormActions } from "@/components/ui/form-actions";
import { cn } from "@/lib/utils";
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
    <main dir="rtl" className="min-h-screen">
      <div className="ui-container pt-10">
        {/* Page Header */}
        <h1 className="text-right text-4xl font-semibold text-[#19183B]">
          יצירת קבלה
        </h1>
        {previewNumber && (
          <p className="text-right text-sm text-muted-fg mt-2">
            מספר תצוגה מקדימה: <span className="font-semibold text-primary">{previewNumber}</span>
          </p>
        )}
        {initial.companyName && (
          <p className="text-right text-sm text-muted-fg mt-1">{initial.companyName}</p>
        )}
        <div className="h-[50px]" />
        <div className="mb-[50px]">
          <Button
            variant="secondary"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <SettingsIcon className="h-4 w-4 ml-2" />
            הגדרות
          </Button>
        </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <Card className="mb-[50px]">
          <CardHeader>
            <CardTitle>הגדרות מסמך</CardTitle>
            <CardDescription>התאם את ברירות המחדל למסמך זה</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="ui-form-grid">
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
                <label className="flex items-center gap-3 p-4 rounded-ui border border-border bg-card cursor-pointer transition-colors hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={roundTotals}
                    onChange={(e) => setRoundTotals(e.target.checked)}
                    className="w-4 h-4 text-primary border-border rounded"
                  />
                  <span className="text-sm text-card-fg">עיגול למטבע שלם</span>
                </label>
              </FieldWrapper>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Sections */}
      <form className="ui-section-gap">
        {/* Customer Details */}
        <FormSection 
          title="פרטי לקוח"
          description="בחר לקוח קיים או הזן שם חדש"
        >
          <div className="ui-form-grid">
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
              <Card className="border-danger bg-danger/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 text-sm font-semibold text-danger">
                    <span>⚠️</span>
                    <span>יש לתקן את השדות המסומנים באדום</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-[50px]">
              {payments.map((row, i) => (
                <Card key={i} className="relative">
                  {/* Delete Button - Icon Only, Absolutely Positioned */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePaymentRow(i)}
                    disabled={payments.length === 1}
                    aria-label="מחיקה"
                    className="absolute top-3 left-3 text-danger hover:text-danger hover:bg-danger/10 disabled:opacity-30"
                    title="מחק"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <CardContent className="pt-12">
                    <div className="ui-form-grid">
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
                        className={paymentErrors[i] ? "border-danger" : ""}
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

                    <div className="mt-4">
                      <PaymentDetailsSection
                        payment={row}
                        onUpdate={(updates) => updatePaymentRow(i, updates)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={addPaymentRow}
              className="w-full border-dashed border-2 border-border mt-[50px]"
            >
              <Plus className="h-4 w-4 ml-2" />
              הוספת תקבול
            </Button>

            <div className="pt-[50px] mt-[50px] border-t border-white">
              <div className="flex justify-between items-center">
                <div className="text-lg font-bold text-white">סה״כ שולם</div>
                <div className="text-2xl font-bold text-white">{formatMoney(total, currency)}</div>
              </div>
              {roundTotals && (
                <p className="text-xs text-white/80 mt-2 text-right">כולל עיגול לסכום סופי</p>
              )}
            </div>
          </div>
        </FormSection>

        {/* Notes Section */}
        <FormSection 
          title="הערות"
          description="הערות שיופיעו במסמך הסופי"
        >
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
        </FormSection>

        {/* Action Buttons */}
        <div className="mt-10">
          <FormActions
            primaryLabel={busy === "issue" ? "יוצר קבלה..." : "יצירת קבלה"}
            secondaryLabel={busy === "draft" ? "שומר בטיוטות..." : "שמירה בטיוטות"}
            onPrimaryClick={onIssue}
            onSecondaryClick={onSaveDraft}
            primaryLoading={busy === "issue"}
            secondaryLoading={busy === "draft"}
            primaryDisabled={busy != null || !sequenceLocked}
            secondaryDisabled={busy != null}
            primaryType="button"
            primaryIcon={<CheckCircle className="h-4 w-4" />}
            secondaryIcon={<Save className="h-4 w-4" />}
          />
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

        {/* Footer Text from Admin Settings */}
        {footerText && footerText.trim() && (
          <Card className="mt-[50px]">
            <CardHeader>
              <CardTitle className="text-base">📌 הערות מערכת</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-fg whitespace-pre-wrap leading-relaxed">
                {footerText}
              </div>
            </CardContent>
          </Card>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          onClick={() => {
            setSuccessModal(null);
            window.location.href = "/dashboard/documents";
          }}
          dir="rtl"
        >
          <Card
            className="w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-8 text-center">
              {/* Success Icon */}
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success mx-auto mb-6">
                <CheckCircle className="h-10 w-10 text-success-fg" />
              </div>

              {/* Title */}
              <CardTitle className="text-2xl mb-3">יצרת בהצלחה קבלה!</CardTitle>

              {/* Receipt Number */}
              <CardDescription className="text-base mb-8">
                מספר קבלה: <span className="font-bold text-card-fg">{successModal.documentNumber}</span>
              </CardDescription>

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
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
                  className="w-full"
                >
                  <FileText className="h-4 w-4 ml-2" />
                  הורדת קבלה (PDF)
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => {
                    setSuccessModal(null);
                    window.location.href = "/dashboard/documents";
                  }}
                  className="w-full"
                >
                  סגירה
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </main>
  );
}
