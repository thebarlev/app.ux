/**
 * PaymentDetailsSection Component
 * 
 * Renders payment-type-specific input fields for the receipt form.
 * Each payment type has its own set of additional detail fields.
 */

import type { PaymentMethod, PaymentRow } from "./actions";

type PaymentDetailsSectionProps = {
  payment: PaymentRow;
  onUpdate: (updates: Partial<PaymentRow>) => void;
};

/**
 * Renders additional detail fields based on the selected payment type.
 * All layouts maintain consistent styling with the rest of the form.
 */
export default function PaymentDetailsSection({
  payment,
  onUpdate,
}: PaymentDetailsSectionProps) {
  const { method } = payment;

  // Common input style - exactly 50px height
  const inputStyle: React.CSSProperties = {
    height: 50,
    padding: "0 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#EDF1F5",
    width: "100%",
    fontSize: 18,
    color: "#19183B",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: "normal",
    marginBottom: 6,
    display: "block",
    color: "#19183B",
  };

  // Credit card layout: 4 fields RTL - card number, card type, deal type, installments
  if (method === "כרטיס אשראי") {
    return (
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, 1fr)" }}>
        {/* Field 1 (rightmost): Card number */}
        <div>
          <label style={labelStyle}>מספר כרטיס</label>
          <input
            type="text"
            maxLength={4}
            placeholder="1234"
            value={payment.cardLastDigits ?? ""}
            onChange={(e) => onUpdate({ cardLastDigits: e.target.value })}
            style={inputStyle}
            aria-label="4 ספרות אחרונות של כרטיס האשראי"
            aria-describedby="card-number-hint"
          />
          <div style={{ fontSize: 12, marginTop: 4, textAlign: 'right', color: '#666' }}>
            (4 ספרות אחרונות)
          </div>
        </div>

        {/* Field 2: Card type */}
        <div>
          <label style={labelStyle}>סוג כרטיס</label>
          <select
            value={payment.cardType ?? ""}
            onChange={(e) => onUpdate({ cardType: e.target.value })}
            style={inputStyle}
            aria-label="בחר סוג כרטיס אשראי"
          >
            <option value="">בחר...</option>
            <option value="visa">Visa</option>
            <option value="mastercard">Mastercard</option>
            <option value="isracard">ישראכרט</option>
            <option value="amex">American Express</option>
            <option value="diners">Diners</option>
            <option value="other">אחר</option>
          </select>
        </div>

        {/* Field 3: Deal type */}
        <div>
          <label style={labelStyle}>סוג עסקה</label>
          <select
            value={payment.cardDealType ?? "regular"}
            onChange={(e) => onUpdate({ cardDealType: e.target.value })}
            style={inputStyle}
            aria-label="בחר סוג עסקה"
          >
            <option value="regular">רגיל</option>
            <option value="payments">תשלומים</option>
            <option value="credit">קרדיט</option>
            <option value="deferred">דחוי</option>
          </select>
        </div>

        {/* Field 4 (leftmost): Installments */}
        <div>
          <label style={labelStyle}>מספר תשלומים</label>
          <input
            type="number"
            min={1}
            max={12}
            placeholder="1"
            value={payment.cardInstallments ?? 1}
            onChange={(e) => onUpdate({ cardInstallments: Number(e.target.value) })}
            style={inputStyle}
            aria-label="מספר תשלומים"
          />
        </div>
      </div>
    );
  }

  // Bank transfer: 3 fields (account, branch, bank)
  if (method === "העברה בנקאית") {
    return (
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div>
          <label style={labelStyle}>חשבון לקוח</label>
          <input
            type="text"
            placeholder="מספר חשבון"
            value={payment.bankAccount ?? ""}
            onChange={(e) => onUpdate({ bankAccount: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>סניף</label>
          <input
            type="text"
            placeholder="מספר סניף"
            value={payment.bankBranch ?? ""}
            onChange={(e) => onUpdate({ bankBranch: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>בנק</label>
          <input
            type="text"
            placeholder="שם הבנק"
            value={payment.bankName ?? ""}
            onChange={(e) => onUpdate({ bankName: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
    );
  }

  // Check: 4 fields (bank, branch, account, check number)
  if (method === "צ׳ק") {
    return (
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div>
          <label style={labelStyle}>בנק לקוח</label>
          <input
            type="text"
            placeholder="שם הבנק"
            value={payment.checkBank ?? ""}
            onChange={(e) => onUpdate({ checkBank: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>סניף לקוח</label>
          <input
            type="text"
            placeholder="מספר סניף"
            value={payment.checkBranch ?? ""}
            onChange={(e) => onUpdate({ checkBranch: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>חשבון לקוח</label>
          <input
            type="text"
            placeholder="מספר חשבון"
            value={payment.checkAccount ?? ""}
            onChange={(e) => onUpdate({ checkAccount: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>מס׳ הצ׳ק</label>
          <input
            type="text"
            placeholder="מספר צ׳ק"
            value={payment.checkNumber ?? ""}
            onChange={(e) => onUpdate({ checkNumber: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
    );
  }

  // Cash: Empty (no extra fields)
  if (method === "מזומן") {
    return null;
  }

  // Payoneer: Single full-width transaction field
  if (method === "Payoneer") {
    return (
      <div>
        <label style={labelStyle}>מספר עסקה</label>
        <input
          type="text"
          placeholder="הזן מספר עסקה"
          value={payment.transactionReference ?? ""}
          onChange={(e) => onUpdate({ transactionReference: e.target.value })}
          style={inputStyle}
          aria-label="מספר עסקה Payoneer"
        />
      </div>
    );
  }

  // Digital wallets: 2 fields (payer account, transaction reference)
  if (
    method === "Bit" ||
    method === "PayBox" ||
    method === "PayPal" ||
    method === "Apple Pay" ||
    method === "Google Pay" ||
    method === "Colu" ||
    method === "Pay"
  ) {
    return (
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label style={labelStyle}>חשבון משלם</label>
          <input
            type="text"
            placeholder="מזהה חשבון (אופציונלי)"
            value={payment.payerAccount ?? ""}
            onChange={(e) => onUpdate({ payerAccount: e.target.value })}
            style={inputStyle}
            aria-label="מזהה חשבון משלם"
          />
        </div>

        <div>
          <label style={labelStyle}>מספר עסקה</label>
          <input
            type="text"
            placeholder="מזהה עסקה (אופציונלי)"
            value={payment.transactionReference ?? ""}
            onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            style={inputStyle}
            aria-label="מזהה עסקה או אסמכתא"
          />
        </div>
      </div>
    );
  }

  // Partial employee deduction: Single transaction field
  if (method === "ניכוי חלק עובד טל״א") {
    return (
      <div>
        <label style={labelStyle}>מס׳ העסקה</label>
        <input
          type="text"
          placeholder="מספר עסקה"
          value={payment.transactionReference ?? ""}
          onChange={(e) => onUpdate({ transactionReference: e.target.value })}
          style={inputStyle}
        />
      </div>
    );
  }

  // Withholding tax: Explanatory text only (no input fields)
  if (method === "ניכוי במקור") {
    return (
      <div
        className="bg-warning/10 border border-warning/30 text-warning-fg"
        style={{
          padding: 12,
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <div style={{ textDecoration: "underline", marginBottom: 4 }}>
          הסכום ששולם למס הכנסה על ידי הלקוח, להסבר
        </div>
        <div style={{ fontWeight: 700 }}>
          הסכום צריך להיות חיובי אם המסמך חיובי
        </div>
      </div>
    );
  }

  // V-CHECK, gift vouchers, crypto: Single transaction field
  if (
    method === "V-CHECK" ||
    method === "שווה כסף" ||
    method === "שובר מתנה" ||
    method === "שובר BuyME" ||
    method === "אתריום" ||
    method === "ביטקוין"
  ) {
    return (
      <div>
        <label style={labelStyle}>מס׳ העסקה</label>
        <input
          type="text"
          placeholder="מספר עסקה"
          value={payment.transactionReference ?? ""}
          onChange={(e) => onUpdate({ transactionReference: e.target.value })}
          style={inputStyle}
        />
      </div>
    );
  }

  // Other deduction: Single description field
  if (method === "ניכוי אחר") {
    return (
      <div>
        <label style={labelStyle}>תיאור</label>
        <input
          type="text"
          placeholder="תיאור הניכוי"
          value={payment.description ?? ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          style={inputStyle}
        />
      </div>
    );
  }

  // No payment method selected or unknown type
  return null;
}
