/**
 * PaymentDetailsSection Component
 * 
 * Renders payment-type-specific input fields for the receipt form.
 * Each payment type has its own set of additional detail fields.
 */

import type { PaymentMethod, PaymentRow } from "./actions";
import type { ReactNode } from "react";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldWrapper } from "@/components/ui/field-wrapper";

type PaymentDetailsSectionProps = {
  payment: PaymentRow;
  onUpdate: (updates: Partial<PaymentRow>) => void;
};

function PaymentGrid({
  children,
  gridRef,
}: {
  children: ReactNode;
  gridRef?: React.RefObject<HTMLDivElement | null>;
}) {
  // Responsive behavior tuned for narrow content areas (e.g. sidebar):
  // - 1 col on mobile
  // - 2 cols only when there's actual space (sm+)
  // - 3 cols only on very wide screens (xl+)
  return (
    <div
      ref={gridRef}
      className="grid w-full grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]"
    >
      {children}
    </div>
  );
}

/**
 * Renders additional detail fields based on the selected payment type.
 * All layouts maintain consistent styling with the rest of the form.
 */
export default function PaymentDetailsSection({
  payment,
  onUpdate,
}: PaymentDetailsSectionProps) {
  const { method } = payment;
  const gridRef = useRef<HTMLDivElement | null>(null);



  // Credit card layout: 4 fields RTL - card number, card type, deal type, installments
  if (method === "כרטיס אשראי") {
    return (
      <PaymentGrid gridRef={gridRef}>
        <FieldWrapper label="מספר כרטיס" id="cardLastDigits" hint="4 ספרות אחרונות" className="w-full min-w-0">
          <Input
            type="text"
            maxLength={4}
            placeholder="1234"
            value={payment.cardLastDigits ?? ""}
            onChange={(e) => onUpdate({ cardLastDigits: e.target.value })}
            aria-label="4 ספרות אחרונות של כרטיס האשראי"
          />
        </FieldWrapper>

        <FieldWrapper label="סוג כרטיס" id="cardType" className="w-full min-w-0">
          <Select
            value={payment.cardType ?? ""}
            onValueChange={(v) => onUpdate({ cardType: v })}
          >
            <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="visa">Visa</SelectItem>
              <SelectItem value="mastercard">Mastercard</SelectItem>
              <SelectItem value="isracard">ישראכרט</SelectItem>
              <SelectItem value="amex">American Express</SelectItem>
              <SelectItem value="diners">Diners</SelectItem>
              <SelectItem value="other">אחר</SelectItem>
            </SelectContent>
          </Select>
        </FieldWrapper>

        <FieldWrapper label="סוג עסקה" id="cardDealType" className="w-full min-w-0">
          <Select
            value={payment.cardDealType ?? "regular"}
            onValueChange={(v) => onUpdate({ cardDealType: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">רגיל</SelectItem>
              <SelectItem value="payments">תשלומים</SelectItem>
              <SelectItem value="credit">קרדיט</SelectItem>
              <SelectItem value="deferred">דחוי</SelectItem>
            </SelectContent>
          </Select>
        </FieldWrapper>

        <FieldWrapper label="מספר תשלומים" id="cardInstallments" className="w-full min-w-0">
          <Input
            type="number"
            min={1}
            max={12}
            placeholder="1"
            value={payment.cardInstallments ?? 1}
            onChange={(e) => onUpdate({ cardInstallments: Number(e.target.value) })}
            aria-label="מספר תשלומים"
          />
        </FieldWrapper>
      </PaymentGrid>
    );
  }

  // Bank transfer: 3 fields (bank, branch, account) - order: בנק | סניף | חשבון לקוח
  if (method === "העברה בנקאית") {
    return (
      <PaymentGrid gridRef={gridRef}>
        <FieldWrapper label="בנק" id="bankName" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="שם הבנק"
            value={payment.bankName ?? ""}
            onChange={(e) => onUpdate({ bankName: e.target.value })}
          />
        </FieldWrapper>

        <FieldWrapper label="סניף" id="bankBranch" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="מספר סניף"
            value={payment.bankBranch ?? ""}
            onChange={(e) => onUpdate({ bankBranch: e.target.value })}
          />
        </FieldWrapper>

        <FieldWrapper label="חשבון לקוח" id="bankAccount" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="מספר חשבון"
            value={payment.bankAccount ?? ""}
            onChange={(e) => onUpdate({ bankAccount: e.target.value })}
          />
        </FieldWrapper>
      </PaymentGrid>
    );
  }

  // Check: 4 fields (bank, branch, account, check number)
  if (method === "צ׳ק") {
    return (
      <PaymentGrid gridRef={gridRef}>
        <FieldWrapper label="בנק לקוח" id="checkBank" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="שם הבנק"
            value={payment.checkBank ?? ""}
            onChange={(e) => onUpdate({ checkBank: e.target.value })}
          />
        </FieldWrapper>

        <FieldWrapper label="סניף לקוח" id="checkBranch" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="מספר סניף"
            value={payment.checkBranch ?? ""}
            onChange={(e) => onUpdate({ checkBranch: e.target.value })}
          />
        </FieldWrapper>

        <FieldWrapper label="חשבון לקוח" id="checkAccount" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="מספר חשבון"
            value={payment.checkAccount ?? ""}
            onChange={(e) => onUpdate({ checkAccount: e.target.value })}
          />
        </FieldWrapper>

        <FieldWrapper label="מס׳ הצ׳ק" id="checkNumber" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="מספר צ׳ק"
            value={payment.checkNumber ?? ""}
            onChange={(e) => onUpdate({ checkNumber: e.target.value })}
          />
        </FieldWrapper>
      </PaymentGrid>
    );
  }

  // Cash: Empty (no extra fields)
  if (method === "מזומן") {
    return null;
  }

  // Payoneer: Single full-width transaction field
  if (method === "Payoneer") {
    return (
      <PaymentGrid gridRef={gridRef}>
        <div className="xl:col-span-2 min-w-0 w-full">
          <FieldWrapper label="מספר עסקה" id="transactionReference" className="w-full min-w-0">
            <Input
              type="text"
              placeholder="הזן מספר עסקה"
              value={payment.transactionReference ?? ""}
              onChange={(e) => onUpdate({ transactionReference: e.target.value })}
              aria-label="מספר עסקה Payoneer"
            />
          </FieldWrapper>
        </div>
      </PaymentGrid>
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
      <PaymentGrid gridRef={gridRef}>
        <FieldWrapper label="חשבון משלם" id="payerAccount" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="מזהה חשבון (אופציונלי)"
            value={payment.payerAccount ?? ""}
            onChange={(e) => onUpdate({ payerAccount: e.target.value })}
            aria-label="מזהה חשבון משלם"
          />
        </FieldWrapper>

        <FieldWrapper label="מספר עסקה" id="transactionReference" className="w-full min-w-0">
          <Input
            type="text"
            placeholder="מזהה עסקה (אופציונלי)"
            value={payment.transactionReference ?? ""}
            onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            aria-label="מזהה עסקה או אסמכתא"
          />
        </FieldWrapper>
      </PaymentGrid>
    );
  }

  // Partial employee deduction: Single transaction field
  if (method === "ניכוי חלק עובד טל״א") {
    return (
      <PaymentGrid>
        <div className="xl:col-span-2 min-w-0 w-full">
          <FieldWrapper label="מס׳ העסקה" id="transactionReference" className="w-full min-w-0">
            <Input
              type="text"
              placeholder="מספר עסקה"
              value={payment.transactionReference ?? ""}
              onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            />
          </FieldWrapper>
        </div>
      </PaymentGrid>
    );
  }

  // Withholding tax: Explanatory text only (no input fields)
  if (method === "ניכוי במקור") {
    return (
      <PaymentGrid>
        <div className="xl:col-span-2 min-w-0 w-full">
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
        </div>
      </PaymentGrid>
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
      <PaymentGrid>
        <div className="xl:col-span-2 min-w-0 w-full">
          <FieldWrapper label="מס׳ העסקה" id="transactionReference" className="w-full min-w-0">
            <Input
              type="text"
              placeholder="מספר עסקה"
              value={payment.transactionReference ?? ""}
              onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            />
          </FieldWrapper>
        </div>
      </PaymentGrid>
    );
  }

  // Other deduction: Single description field
  if (method === "ניכוי אחר") {
    return (
      <PaymentGrid>
        <div className="xl:col-span-2 min-w-0 w-full">
          <FieldWrapper label="תיאור" id="description" className="w-full min-w-0">
            <Input
              type="text"
              placeholder="תיאור הניכוי"
              value={payment.description ?? ""}
              onChange={(e) => onUpdate({ description: e.target.value })}
            />
          </FieldWrapper>
        </div>
      </PaymentGrid>
    );
  }

  // No payment method selected or unknown type
  return null;
}
