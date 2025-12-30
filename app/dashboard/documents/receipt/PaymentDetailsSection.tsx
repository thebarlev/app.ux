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

  // Common input style
  const inputStyle: React.CSSProperties = {
    padding: 8,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    width: "100%",
    fontSize: 14,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    display: "block",
  };

  // Credit card layout: 4 fields RTL - card number, card type, deal type, installments
  if (method === "כרטיס אשראי") {
    return (
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, 1fr)" }}>
        {/* Field 1 (rightmost): Card number */}
        <div>
          <input
            type="text"
            maxLength={4}
            placeholder="מס' הכרטיס"
            value={payment.cardLastDigits ?? ""}
            onChange={(e) => onUpdate({ cardLastDigits: e.target.value })}
            style={inputStyle}
          />
        </div>

        {/* Field 2: Card type */}
        <div>
          <select
            value={payment.cardType ?? ""}
            onChange={(e) => onUpdate({ cardType: e.target.value })}
            style={inputStyle}
          >
            <option value="">סוג הכרטיס</option>
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
          <select
            value={payment.cardDealType ?? "regular"}
            onChange={(e) => onUpdate({ cardDealType: e.target.value })}
            style={inputStyle}
          >
            <option value="regular">סוג העסקה</option>
            <option value="payments">תשלומים</option>
            <option value="credit">קרדיט</option>
            <option value="deferred">דחוי</option>
          </select>
        </div>

        {/* Field 4 (leftmost): Installments */}
        <div>
          <input
            type="number"
            min={1}
            max={12}
            placeholder="תשלומים"
            value={payment.cardInstallments ?? 1}
            onChange={(e) => onUpdate({ cardInstallments: Number(e.target.value) })}
            style={inputStyle}
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
        <input
          type="text"
          placeholder="מס' העסקה"
          value={payment.transactionReference ?? ""}
          onChange={(e) => onUpdate({ transactionReference: e.target.value })}
          style={inputStyle}
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
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <input
            type="text"
            placeholder="חשבון משלם (לא חובה)"
            value={payment.payerAccount ?? ""}
            onChange={(e) => onUpdate({ payerAccount: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <input
            type="text"
            placeholder="מס' העסקה (לא חובה)"
            value={payment.transactionReference ?? ""}
            onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            style={inputStyle}
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
        style={{
          padding: 12,
          background: "#fef3c7",
          border: "1px solid #fde68a",
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
