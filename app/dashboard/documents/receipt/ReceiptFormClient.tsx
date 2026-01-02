"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { InitialReceiptCreateData } from "./actions";
import type { PaymentRow, ReceiptDraftPayload } from "@/lib/types/receipt";
import { issueReceiptAction, saveReceiptDraftAction, updateReceiptDraftAction } from "./actions";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import PaymentDetailsSection from "./PaymentDetailsSection";

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
      <div style={{ padding: 16, border: "1px solid #fca5a5", borderRadius: 12, background: "#fff1f2" }}>
        <div style={{ fontWeight: 800 }}>שגיאה בטעינת הנתונים</div>
        <div style={{ marginTop: 8, opacity: 0.9 }}>{initial.message}</div>
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
    <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          padding: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "white",
        }}
      >
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1 }}>
            קבלה {previewNumber && <span style={{ fontSize: 18, fontWeight: 700, opacity: 0.75 }}>| {previewNumber}</span>}
          </div>
        </div>

        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 800 }}>{initial.companyName ?? "העסק שלי"}</div>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              cursor: "pointer",
            }}
          >
            הגדרות
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, background: "white" }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>הגדרות</div>

          <div style={{ display: "grid", gap: 12, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <div style={{ fontWeight: 800 }}>שפה</div>
              <select value={language} onChange={(e) => setLanguage(e.target.value as any)} style={{ marginTop: 6, width: "100%", padding: 10 }}>
                <option value="he">עברית</option>
                <option value="en">אנגלית</option>
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 800 }}>מטבע ברירת מחדל</div>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ marginTop: 6, width: "100%", padding: 10 }}>
                {allowedCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
                מותרים: {allowedCurrencies.join(", ")}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 800 }}>עיגול סכומים</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input type="checkbox" checked={roundTotals} onChange={(e) => setRoundTotals(e.target.checked)} />
                לעגל את הסכום הסופי למטבע שלם (ללא אגורות)
              </label>
            </div>
          </div>

          <div style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
            הערה: כרגע אלו ברירות מחדל מקומיות למסך (כמו שביקשת). בהמשך נחבר להגדרות חברה ב־DB.
          </div>
        </div>
      )}

      {/* Document details */}
      <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, background: "white" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>פרטי המסמך</div>

        <div style={{ display: "grid", gap: 12, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div ref={customerNameRef}>
            <div style={{ fontWeight: 800 }}>שם לקוח <span style={{ color: "#ef4444" }}>*</span></div>
            <div style={{ marginTop: 6 }}>
              <CustomerAutocomplete
                value={customerName}
                onChange={(value) => {
                  setCustomerName(value);
                  // Clear error when user starts typing
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
                onAddNewCustomer={() => {
                  // Only open modal when user explicitly clicks "+ Add customer"
                  setShowQuickAddModal(true);
                }}
                placeholder="התחל להקליד שם לקוח..."
              />
            </div>
            {customerNameError && (
              <div className="error-message" style={{ 
                marginTop: 6, 
                color: "#dc2626", 
                fontSize: 13, 
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4
              }}>
                <span>⚠️</span>
                <span>{customerNameError}</span>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 800 }}>תאריך מסמך</div>
            <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} style={{ marginTop: 6, width: "100%", padding: 10 }} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800 }}>תיאור <span style={{ color: "#ef4444" }}>*</span></div>
          <input 
            ref={descriptionInputRef}
            value={description} 
            onChange={(e) => {
              setDescription(e.target.value);
              // Clear error when user starts typing
              if (descriptionError && e.target.value.trim().length >= 5) {
                setDescriptionError(null);
              }
            }} 
            style={{ 
              marginTop: 6, 
              width: "100%", 
              padding: 10,
              border: descriptionError ? "2px solid #ef4444" : "1px solid #d1d5db",
              borderRadius: 8,
              outline: "none",
            }} 
            placeholder="לדוגמה: שירותי עיצוב (לפחות 5 תווים)" 
          />
          {descriptionError && (
            <div style={{ 
              marginTop: 6, 
              color: "#ef4444", 
              fontSize: 14, 
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4
            }}>
              <span>⚠️</span>
              <span>{descriptionError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payments */}
      <div ref={paymentsTableRef} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, background: "white" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>פירוט תקבולים</div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          איך שילמו לך? אם שילמו לך בכמה צורות תשלום, אפשר לבחור כמה סוגי תקבולים.
        </div>
        
        {Object.keys(paymentErrors).length > 0 && (
          <div className="error-message" style={{ 
            marginTop: 8,
            padding: 10,
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 8,
            color: "#dc2626", 
            fontSize: 13, 
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4
          }}>
            <span>⚠️</span>
            <span>יש לתקן את השדות המסומנים באדום</span>
          </div>
        )}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: "right", opacity: 0.85 }}>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>אמצעי</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>תאריך</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>סכום</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>מטבע</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>פרטים (אופציונלי)</th>
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}></th>
              </tr>
            </thead>

            <tbody>
              {payments.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <select
                      value={row.method}
                      onChange={(e) => {
                        updatePaymentRow(i, { method: e.target.value as any });
                        // Clear error when user selects payment method
                        if (paymentErrors[i]) {
                          const newErrors = { ...paymentErrors };
                          delete newErrors[i];
                          setPaymentErrors(newErrors);
                        }
                      }}
                      style={{ 
                        width: 200, 
                        padding: 8,
                        border: paymentErrors[i] ? "2px solid #dc2626" : "1px solid #d1d5db"
                      }}
                    >
                      <option value="">בחר…</option>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => updatePaymentRow(i, { date: e.target.value })}
                      style={{ padding: 8 }}
                    />
                  </td>

                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.amount}
                      onChange={(e) => {
                        updatePaymentRow(i, { amount: Number(e.target.value) });
                        // Clear error when user enters valid amount
                        if (paymentErrors[i] && Number(e.target.value) > 0) {
                          const newErrors = { ...paymentErrors };
                          delete newErrors[i];
                          setPaymentErrors(newErrors);
                        }
                      }}
                      style={{ 
                        width: 140, 
                        padding: 8,
                        border: paymentErrors[i] ? "2px solid #dc2626" : "1px solid #d1d5db"
                      }}
                    />
                  </td>

                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <select
                      value={row.currency}
                      onChange={(e) => updatePaymentRow(i, { currency: e.target.value })}
                      style={{ width: 90, padding: 8 }}
                    >
                      {allowedCurrencies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <PaymentDetailsSection
                      payment={row}
                      onUpdate={(updates) => updatePaymentRow(i, updates)}
                    />
                  </td>

                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <button
                      type="button"
                      onClick={() => removePaymentRow(i)}
                      disabled={payments.length === 1}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: payments.length === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      מחק
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addPaymentRow}
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
          }}
        >
          הוספת תקבול +
        </button>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 900 }}>סה״כ שולם</div>
          <div style={{ fontWeight: 900 }}>{formatMoney(total, currency)}</div>
        </div>

        {roundTotals && (
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            כולל עיגול לסכום סופי (ללא אגורות).
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, background: "white" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>הערות</div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800 }}>הערות שיופיעו במסמך</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 6, width: "100%", padding: 10, minHeight: 90 }} />
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={busy != null}
          style={{
            padding: "12px 20px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            background: busy === "draft" ? "#f3f4f6" : "white",
            cursor: busy != null ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          {busy === "draft" ? "שומר בטיוטות..." : "💾 שמירה בטיוטות"}
        </button>

        <button
          type="button"
          onClick={onIssue}
          disabled={busy != null || !sequenceLocked}
          style={{
            padding: "12px 20px",
            borderRadius: 12,
            border: "1px solid #111827",
            background: (busy != null || !sequenceLocked) ? "#9ca3af" : "#111827",
            color: "white",
            cursor: (busy != null || !sequenceLocked) ? "not-allowed" : "pointer",
            opacity: (busy != null || !sequenceLocked) ? 0.6 : 1,
            fontWeight: 700,
            fontSize: 15,
          }}
          title={!sequenceLocked ? "נדרש לבחור מספר התחלתי" : ""}
        >
          {busy === "issue" ? "יוצר קבלה..." : "✅ יצירת קבלה"}
        </button>
      </div>

      {message && (
        <div style={{ 
          padding: 12, 
          borderRadius: 12, 
          border: message.includes("שגיאה") ? "1px solid #fca5a5" : "1px solid #bfdbfe",
          background: message.includes("שגיאה") ? "#fef2f2" : "#eff6ff",
          color: message.includes("שגיאה") ? "#991b1b" : "#1e40af",
        }}>
          {message.includes("שגיאה") && "⚠️ "}{message}
        </div>
      )}

      {/* Footer Text from Admin Settings */}
      {footerText && footerText.trim() && (
        <div style={{
          marginTop: 24,
          padding: 16,
          border: "1px solid #dbeafe",
          borderRadius: 12,
          background: "#eff6ff",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#1e40af" }}>
            📌 הערות מערכת
          </div>
          <div style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "#1e3a8a",
            whiteSpace: "pre-wrap",
          }}>
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
