/**
 * PaymentDetailsSection Component
 * 
 * Renders payment-type-specific input fields for the receipt form.
 * Each payment type has its own set of additional detail fields.
 */

import type { PaymentMethod, PaymentRow } from "@/lib/documents/types";
import type { ReactNode } from "react";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil } from "lucide-react";

type PaymentDetailsSectionProps = {
  payment: PaymentRow;
  onUpdate: (updates: Partial<PaymentRow>) => void;
  isConfirmed?: boolean;
  onConfirm?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  renderMode?: "default" | "inline";
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
  isConfirmed = false,
  onConfirm,
  onEdit,
  onDelete,
  renderMode = "default",
}: PaymentDetailsSectionProps) {
  const { method } = payment;
  const gridRef = useRef<HTMLDivElement | null>(null);

  // ============ INLINE MODE ============
  // רינדור בשורה אחת עבור התצוגה המשולבת
  if (renderMode === "inline") {
    if (!method) return null;

    // When confirmed: show only filled values (no empty inputs/labels)
    if (isConfirmed) {
      const parts: string[] = [];
      const push = (label: string, value: unknown) => {
        const s = typeof value === "number" ? String(value) : String(value ?? "").trim();
        if (!s) return;
        parts.push(`${label}: ${s}`);
      };

      if (method === "כרטיס אשראי") {
        push("4 ספרות", payment.cardLastDigits);
        push("סוג", payment.cardType);
        push("עסקה", payment.cardDealType);
        if (Number.isFinite(payment.cardInstallments as any)) push("תשלומים", payment.cardInstallments);
      } else if (method === "העברה בנקאית") {
        push("בנק", payment.bankName);
        push("סניף", payment.bankBranch ?? (payment as any).branch);
        push("חשבון", payment.bankAccount ?? (payment as any).accountNumber);
      } else if (method === "צ׳ק") {
        push("בנק", payment.checkBank);
        push("סניף", payment.checkBranch);
        push("חשבון", payment.checkAccount);
        push("צ׳ק", payment.checkNumber);
      } else if (
        method === "Bit" ||
        method === "PayBox" ||
        method === "PayPal" ||
        method === "Apple Pay" ||
        method === "Google Pay" ||
        method === "Colu" ||
        method === "Pay"
      ) {
        push("חשבון", payment.payerAccount);
        push("מס׳ עסקה", payment.transactionReference);
      } else if (
        method === "Payoneer" ||
        method === "ניכוי חלק עובד טל״א" ||
        method === "V-CHECK" ||
        method === "שווה כסף" ||
        method === "שובר מתנה" ||
        method === "שובר BuyME" ||
        method === "אתריום" ||
        method === "ביטקוין"
      ) {
        push("מס׳ עסקה", payment.transactionReference);
      } else if (method === "ניכוי אחר") {
        push("תיאור", payment.description);
      } else if (method === "ניכוי במקור") {
        // Keep explanatory text (not an input)
        return (
          <div className="text-xs text-warning-fg bg-warning/10 border border-warning/30 px-3 py-2 rounded">
            <div className="font-semibold">הסכום ששולם למס הכנסה על ידי הלקוח</div>
          </div>
        );
      }

      if (parts.length === 0) return null;
      return (
        <div className="text-sm text-muted-fg text-right flex flex-wrap gap-2">
          {parts.map((t) => (
            <span key={t} className="whitespace-nowrap">
              {t}
            </span>
          ))}
        </div>
      );
    }

    // Credit card: 4 fields in a row
    if (method === "כרטיס אשראי") {
      return (
        <div className="flex gap-3 min-w-0">
          <Input
            placeholder="4 ספרות"
            value={payment.cardLastDigits ?? ""}
            onChange={(e) => onUpdate({ cardLastDigits: e.target.value })}
            maxLength={4}
            className="ti-items-input text-right flex-1 min-w-[40px]"
            disabled={isConfirmed}
          />
          <Select
            value={payment.cardType ?? ""}
            onValueChange={(v) => onUpdate({ cardType: v })}
            disabled={isConfirmed}
          >
            <SelectTrigger className="ti-items-select flex-1 min-w-[50px]">
              <SelectValue placeholder="סוג..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visa">Visa</SelectItem>
              <SelectItem value="mastercard">Mastercard</SelectItem>
              <SelectItem value="isracard">ישראכרט</SelectItem>
              <SelectItem value="amex">Amex</SelectItem>
              <SelectItem value="diners">Diners</SelectItem>
              <SelectItem value="other">אחר</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={payment.cardDealType ?? "regular"}
            onValueChange={(v) => onUpdate({ cardDealType: v })}
            disabled={isConfirmed}
          >
            <SelectTrigger className="ti-items-select flex-1 min-w-[50px]">
              <SelectValue placeholder="עסקה..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">רגיל</SelectItem>
              <SelectItem value="payments">תשלומים</SelectItem>
              <SelectItem value="credit">קרדיט</SelectItem>
              <SelectItem value="deferred">דחוי</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="תשלומים"
            min={1}
            max={12}
            value={String(payment.cardInstallments ?? 1)}
            onChange={(e) => onUpdate({ cardInstallments: Number(e.target.value) })}
            className="ti-items-input text-right flex-1 min-w-[40px]"
            disabled={isConfirmed}
          />
        </div>
      );
    }

    // Bank transfer: 3 fields
    if (method === "העברה בנקאית") {
      return (
        <div className="flex gap-3 min-w-0">
          <Input
            placeholder="בנק"
            value={payment.bankName ?? ""}
            onChange={(e) => onUpdate({ bankName: e.target.value })}
            className="ti-items-input text-right flex-1 min-w-[50px]"
            disabled={isConfirmed}
          />
          <Input
            placeholder="סניף"
            value={payment.bankBranch ?? ""}
            onChange={(e) => onUpdate({ bankBranch: e.target.value })}
            className="ti-items-input text-right flex-1 min-w-[40px]"
            disabled={isConfirmed}
          />
          <Input
            placeholder="חשבון"
            value={payment.bankAccount ?? ""}
            onChange={(e) => onUpdate({ bankAccount: e.target.value })}
            className="ti-items-input text-right flex-1 min-w-[60px]"
            disabled={isConfirmed}
          />
        </div>
      );
    }

    // Check: 4 fields
    if (method === "צ׳ק") {
      return (
        <div className="flex gap-3 min-w-0">
          <Input
            placeholder="בנק"
            value={payment.checkBank ?? ""}
            onChange={(e) => onUpdate({ checkBank: e.target.value })}
            className="ti-items-input text-right flex-1 min-w-[45px]"
            disabled={isConfirmed}
          />
          <Input
            placeholder="סניף"
            value={payment.checkBranch ?? ""}
            onChange={(e) => onUpdate({ checkBranch: e.target.value })}
            className="ti-items-input text-right flex-1 min-w-[40px]"
            disabled={isConfirmed}
          />
          <Input
            placeholder="חשבון"
            value={payment.checkAccount ?? ""}
            onChange={(e) => onUpdate({ checkAccount: e.target.value })}
            className="ti-items-input text-right flex-1 min-w-[55px]"
            disabled={isConfirmed}
          />
          <Input
            placeholder="מס׳ צ׳ק"
            value={payment.checkNumber ?? ""}
            onChange={(e) => onUpdate({ checkNumber: e.target.value })}
            className="ti-items-input text-right flex-1 min-w-[45px]"
            disabled={isConfirmed}
          />
        </div>
      );
    }

    // Digital wallets: 2 fields
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
        <div className="flex gap-3 min-w-0">
          <Input
            placeholder="חשבון משלם"
            value={payment.payerAccount ?? ""}
            onChange={(e) => onUpdate({ payerAccount: e.target.value })}
            className="ti-items-input text-right flex-1"
            disabled={isConfirmed}
          />
          <Input
            placeholder="מספר עסקה"
            value={payment.transactionReference ?? ""}
            onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            className="ti-items-input text-right flex-1"
            disabled={isConfirmed}
          />
        </div>
      );
    }

    // Payoneer, ניכוי חלק עובד, V-CHECK/vouchers/crypto: Single field
    if (
      method === "Payoneer" ||
      method === "ניכוי חלק עובד טל״א" ||
      method === "V-CHECK" ||
      method === "שווה כסף" ||
      method === "שובר מתנה" ||
      method === "שובר BuyME" ||
      method === "אתריום" ||
      method === "ביטקוין"
    ) {
      return (
        <Input
          placeholder="מספר עסקה"
          value={payment.transactionReference ?? ""}
          onChange={(e) => onUpdate({ transactionReference: e.target.value })}
          className="ti-items-input text-right w-full"
          disabled={isConfirmed}
        />
      );
    }

    // Other deduction: Description field
    if (method === "ניכוי אחר") {
      return (
        <Input
          placeholder="תיאור"
          value={payment.description ?? ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          className="ti-items-input text-right w-full"
          disabled={isConfirmed}
        />
      );
    }

    // Withholding tax: Explanatory text
    if (method === "ניכוי במקור") {
      return (
        <div className="text-xs text-warning-fg bg-warning/10 border border-warning/30 px-3 py-2 rounded">
          <div className="font-semibold">הסכום ששולם למס הכנסה על ידי הלקוח</div>
        </div>
      );
    }

    // Cash or other: No additional fields
    return null;
  }

  // ============ DEFAULT MODE ============
  // הרינדור המקורי עם הגריד



  // Credit card layout: 4 fields RTL - card number, card type, deal type, installments
  if (method === "כרטיס אשראי") {
    return (
      <PaymentGrid gridRef={gridRef}>
        <Input
          id="cardLastDigits"
          placeholder="מספר כרטיס (4 ספרות אחרונות)"
          value={payment.cardLastDigits ?? ""}
          onChange={(e) => onUpdate({ cardLastDigits: e.target.value })}
          maxLength={4}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        <Select
          value={payment.cardType ?? ""}
          onValueChange={(v) => onUpdate({ cardType: v })}
          disabled={isConfirmed}
        >
          <SelectTrigger id="cardType" className="ti-items-select w-full min-w-0">
            <SelectValue placeholder="סוג כרטיס..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="visa">Visa</SelectItem>
            <SelectItem value="mastercard">Mastercard</SelectItem>
            <SelectItem value="isracard">ישראכרט</SelectItem>
            <SelectItem value="amex">American Express</SelectItem>
            <SelectItem value="diners">Diners</SelectItem>
            <SelectItem value="other">אחר</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={payment.cardDealType ?? "regular"}
          onValueChange={(v) => onUpdate({ cardDealType: v })}
          disabled={isConfirmed}
        >
          <SelectTrigger id="cardDealType" className="ti-items-select w-full min-w-0">
            <SelectValue placeholder="סוג עסקה..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="regular">רגיל</SelectItem>
            <SelectItem value="payments">תשלומים</SelectItem>
            <SelectItem value="credit">קרדיט</SelectItem>
            <SelectItem value="deferred">דחוי</SelectItem>
          </SelectContent>
        </Select>

        <Input
          id="cardInstallments"
          type="number"
          placeholder="מספר תשלומים"
          min={1}
          max={12}
          value={String(payment.cardInstallments ?? 1)}
          onChange={(e) => onUpdate({ cardInstallments: Number(e.target.value) })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        {/* כפתורים בתוך הגריד */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </PaymentGrid>
    );
  }

  // Bank transfer: 3 fields (bank, branch, account) - order: בנק | סניף | חשבון לקוח
  if (method === "העברה בנקאית") {
    return (
      <PaymentGrid gridRef={gridRef}>
        <Input
          id="bankName"
          placeholder="בנק"
          value={payment.bankName ?? ""}
          onChange={(e) => onUpdate({ bankName: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        <Input
          id="bankBranch"
          placeholder="סניף"
          value={payment.bankBranch ?? ""}
          onChange={(e) => onUpdate({ bankBranch: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        <Input
          id="bankAccount"
          placeholder="חשבון לקוח"
          value={payment.bankAccount ?? ""}
          onChange={(e) => onUpdate({ bankAccount: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        {/* כפתורים בתוך הגריד */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </PaymentGrid>
    );
  }

  // Check: 4 fields (bank, branch, account, check number)
  if (method === "צ׳ק") {
    return (
      <PaymentGrid gridRef={gridRef}>
        <Input
          id="checkBank"
          placeholder="בנק לקוח"
          value={payment.checkBank ?? ""}
          onChange={(e) => onUpdate({ checkBank: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        <Input
          id="checkBranch"
          placeholder="סניף לקוח"
          value={payment.checkBranch ?? ""}
          onChange={(e) => onUpdate({ checkBranch: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        <Input
          id="checkAccount"
          placeholder="חשבון לקוח"
          value={payment.checkAccount ?? ""}
          onChange={(e) => onUpdate({ checkAccount: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        <Input
          id="checkNumber"
          placeholder="מס׳ הצ׳ק"
          value={payment.checkNumber ?? ""}
          onChange={(e) => onUpdate({ checkNumber: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        {/* כפתורים בתוך הגריד */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
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
          <Input
            id="transactionReference"
            placeholder="מספר עסקה"
            value={payment.transactionReference ?? ""}
            onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            className="ti-items-input text-right min-w-0"
            disabled={isConfirmed}
          />
        </div>

        {/* כפתורים */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
        <Input
          id="payerAccount"
          placeholder="חשבון משלם"
          value={payment.payerAccount ?? ""}
          onChange={(e) => onUpdate({ payerAccount: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        <Input
          id="transactionReference"
          placeholder="מספר עסקה"
          value={payment.transactionReference ?? ""}
          onChange={(e) => onUpdate({ transactionReference: e.target.value })}
          className="ti-items-input text-right min-w-0"
          disabled={isConfirmed}
        />

        {/* כפתורים */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </PaymentGrid>
    );
  }

  // Partial employee deduction: Single transaction field
  if (method === "ניכוי חלק עובד טל״א") {
    return (
      <PaymentGrid>
        <div className="xl:col-span-2 min-w-0 w-full">
          <Input
            id="transactionReference"
            placeholder="מס׳ העסקה"
            value={payment.transactionReference ?? ""}
            onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            className="ti-items-input text-right min-w-0"
            disabled={isConfirmed}
          />
        </div>

        {/* כפתורים */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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

        {/* כפתורים */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
          <Input
            id="transactionReference"
            placeholder="מס׳ העסקה"
            value={payment.transactionReference ?? ""}
            onChange={(e) => onUpdate({ transactionReference: e.target.value })}
            className="ti-items-input text-right min-w-0"
            disabled={isConfirmed}
          />
        </div>

        {/* כפתורים */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </PaymentGrid>
    );
  }

  // Other deduction: Single description field
  if (method === "ניכוי אחר") {
    return (
      <PaymentGrid>
        <div className="xl:col-span-2 min-w-0 w-full">
          <Input
            id="description"
            placeholder="תיאור"
            value={payment.description ?? ""}
            onChange={(e) => onUpdate({ description: e.target.value })}
            className="ti-items-input text-right min-w-0"
            disabled={isConfirmed}
          />
        </div>

        {/* כפתורים */}
        <div className="flex items-center justify-center gap-3">
          {isConfirmed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="עריכה"
              className="text-fg hover:text-fg bg-transparent hover:bg-transparent"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="default" onClick={onConfirm}>
              אישור
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="מחיקה"
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </PaymentGrid>
    );
  }

  // No payment method selected or unknown type
  return null;
}
