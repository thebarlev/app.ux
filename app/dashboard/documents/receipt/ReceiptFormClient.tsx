"use client";

import { useMemo, useState } from "react";
import StartingNumberModal from "@/components/documents/StartingNumberModal";
import type { InitialReceiptCreateData, PaymentRow, ReceiptDraftPayload } from "./actions";
import { issueReceiptAction, saveReceiptDraftAction } from "./actions";

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

export default function ReceiptFormClient({ initial }: { initial: InitialReceiptCreateData }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [sequenceLocked, setSequenceLocked] = useState(initial.ok ? initial.sequenceLocked : false);
  const [startingModalOpen, setStartingModalOpen] = useState(initial.ok ? !initial.sequenceLocked : false);

  const [language, setLanguage] = useState<"he" | "en">(initial.ok ? initial.settings.language : "he");
  const [roundTotals, setRoundTotals] = useState<boolean>(initial.ok ? initial.settings.roundTotals : false);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>(
    initial.ok ? initial.settings.allowedCurrencies : ["₪", "$", "€"]
  );
  const [currency, setCurrency] = useState<string>(initial.ok ? initial.settings.defaultCurrency : "₪");

  const [customerName, setCustomerName] = useState("");
  const [documentDate, setDocumentDate] = useState(todayYmd());
  const [description, setDescription] = useState("");

  const [notes, setNotes] = useState("");
  const [footerNotes, setFooterNotes] = useState("");

  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: "", date: todayYmd(), amount: 0, currency },
  ]);

  const [busy, setBusy] = useState<null | "draft" | "issue">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [issuedNumber, setIssuedNumber] = useState<number | null>(null);

  const total = useMemo(() => {
    const sum = payments.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0);
    if (!roundTotals) return sum;
    return Math.round(sum);
  }, [payments, roundTotals]);

  const payload: ReceiptDraftPayload = useMemo(() => {
    return {
      documentType: "receipt",
      customerName,
      documentDate,
      description,
      payments,
      notes,
      footerNotes,
      currency,
      total,
      roundTotals,
      language,
    };
  }, [customerName, documentDate, description, payments, notes, footerNotes, currency, total, roundTotals, language]);

  if (!initial.ok) {
    return (
      <div style={{ padding: 16, border: "1px solid #fca5a5", borderRadius: 12, background: "#fff1f2" }}>
        <div style={{ fontWeight: 800 }}>שגיאה בטעינת הנתונים</div>
        <div style={{ marginTop: 8, opacity: 0.9 }}>{initial.message}</div>
      </div>
    );
  }

  const headerNumberText =
    issuedNumber != null ? `| ${issuedNumber}` : `| ${initial.nextNumberText || "מספר יוקצה בעת הפקה"}`;

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

  async function onSaveDraft() {
    setMessage(null);
    setBusy("draft");
    try {
      const res = await saveReceiptDraftAction(payload);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      setMessage("✅ הטיוטה נשמרה בהצלחה");
    } finally {
      setBusy(null);
    }
  }

  async function onIssue() {
    setMessage(null);
    setBusy("issue");
    try {
      const res = await issueReceiptAction(payload);
      if (!res.ok) {
        setMessage(res.message + (res.details ? ` (${res.details})` : ""));
        return;
      }
      setIssuedNumber(res.documentNumber);
      setMessage(`✅ המסמך הופק בהצלחה. מספר: ${res.documentNumber}`);
    } finally {
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
            קבלה <span style={{ fontSize: 18, fontWeight: 700, opacity: 0.75 }}>{headerNumberText}</span>
          </div>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            {issuedNumber == null ? "טיוטה (מספר יוקצה בעת הפקה)" : "מסמך מופק (לא ניתן לעריכה)"}
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

      {/* First-time sequence modal */}
      {startingModalOpen && (
        <div style={{ padding: 16, border: "1px solid #fde68a", borderRadius: 16, background: "#fffbeb" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>לפני שמתחילים</div>
          <div style={{ opacity: 0.85, marginBottom: 12 }}>
            נדרש לבחור מספר מסמך ראשון (חד־פעמי). לאחר מכן לא תראה את החלון שוב.
          </div>
          <StartingNumberModal
            documentType="receipt"
            onClose={() => setStartingModalOpen(false)}
            onSuccess={() => {
              setSequenceLocked(true);
              setStartingModalOpen(false);
              setMessage("✅ המספור נקבע. אפשר להתחיל ליצור קבלה.");
            }}
          />
        </div>
      )}

      {/* Document details */}
      <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, background: "white" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>פרטי המסמך</div>

        <div style={{ display: "grid", gap: 12, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div>
            <div style={{ fontWeight: 800 }}>שם לקוח</div>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ marginTop: 6, width: "100%", padding: 10 }} placeholder="לדוגמה: ישראל ישראלי" />
          </div>

          <div>
            <div style={{ fontWeight: 800 }}>תאריך מסמך</div>
            <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} style={{ marginTop: 6, width: "100%", padding: 10 }} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800 }}>תיאור</div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginTop: 6, width: "100%", padding: 10 }} placeholder="לדוגמה: שירותי עיצוב" />
        </div>
      </div>

      {/* Payments */}
      <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, background: "white" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>פירוט תקבולים</div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          איך שילמו לך? אם שילמו לך בכמה צורות תשלום, אפשר לבחור כמה סוגי תקבולים.
        </div>

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
                      onChange={(e) => updatePaymentRow(i, { method: e.target.value as any })}
                      style={{ width: 200, padding: 8 }}
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
                      onChange={(e) => updatePaymentRow(i, { amount: Number(e.target.value) })}
                      style={{ width: 140, padding: 8 }}
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
                    <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, minmax(120px, 1fr))" }}>
                      <input
                        placeholder="בנק"
                        value={row.bankName ?? ""}
                        onChange={(e) => updatePaymentRow(i, { bankName: e.target.value })}
                        style={{ padding: 8 }}
                      />
                      <input
                        placeholder="סניף"
                        value={row.branch ?? ""}
                        onChange={(e) => updatePaymentRow(i, { branch: e.target.value })}
                        style={{ padding: 8 }}
                      />
                      <input
                        placeholder="חשבון"
                        value={row.accountNumber ?? ""}
                        onChange={(e) => updatePaymentRow(i, { accountNumber: e.target.value })}
                        style={{ padding: 8 }}
                      />
                    </div>
                  </td>

                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <button
                      type="button"
                      onClick={() => removePaymentRow(i)}
                      disabled={issuedNumber != null || payments.length === 1}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: issuedNumber != null ? "#f3f4f6" : "white",
                        cursor: issuedNumber != null ? "not-allowed" : "pointer",
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
          disabled={issuedNumber != null}
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: issuedNumber != null ? "not-allowed" : "pointer",
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

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800 }}>הערות בתחתית המסמך</div>
          <textarea value={footerNotes} onChange={(e) => setFooterNotes(e.target.value)} style={{ marginTop: 6, width: "100%", padding: 10, minHeight: 70 }} />
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setPreviewOpen((v) => !v)}
          style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
        >
          תצוגה מקדימה
        </button>

        <button
          type="button"
          onClick={onSaveDraft}
          disabled={busy != null || issuedNumber != null}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: busy === "draft" ? "#f3f4f6" : "white",
            cursor: busy != null || issuedNumber != null ? "not-allowed" : "pointer",
          }}
        >
          {busy === "draft" ? "שומר..." : "שמירת טיוטה"}
        </button>

        <button
          type="button"
          onClick={onIssue}
          disabled={busy != null || issuedNumber != null || !sequenceLocked}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #111827",
            background: busy === "issue" ? "#111827" : "#111827",
            color: "white",
            cursor: busy != null || issuedNumber != null || !sequenceLocked ? "not-allowed" : "pointer",
            opacity: busy != null || issuedNumber != null || !sequenceLocked ? 0.6 : 1,
          }}
        >
          {busy === "issue" ? "מפיק..." : "הפקת מסמך"}
        </button>
      </div>

      {!sequenceLocked && (
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          כדי להפיק מסמך חייבים לקבוע מספור חד־פעמי קודם.
        </div>
      )}

      {message && (
        <div style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
          {message}
        </div>
      )}

      {/* Preview */}
      {previewOpen && (
        <div style={{ padding: 16, border: "1px dashed #d1d5db", borderRadius: 16, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>תצוגה מקדימה</div>
          <div style={{ display: "grid", gap: 6, opacity: 0.9 }}>
            <div><b>לקוח:</b> {customerName || "—"}</div>
            <div><b>תאריך:</b> {documentDate}</div>
            <div><b>תיאור:</b> {description || "—"}</div>
            <div><b>סה״כ:</b> {formatMoney(total, currency)}</div>
            <div style={{ marginTop: 8 }}><b>תקבולים:</b></div>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {payments.map((p, idx) => (
                <li key={idx}>
                  {p.method || "—"} | {p.date} | {formatMoney(p.amount, p.currency)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
