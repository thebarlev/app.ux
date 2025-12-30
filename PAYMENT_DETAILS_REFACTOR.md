# Payment Details Section Refactoring

**Date:** December 30, 2025  
**Feature:** Type-safe payment details component with payment-type-specific fields

## Overview

Refactored the "Payment Details" section in the receipt form to be modular, type-safe, and maintainable. Created a dedicated `PaymentDetailsSection` component that dynamically renders appropriate input fields based on the selected payment type.

## Problem Statement

The original implementation had a fixed 3-field layout (בנק, סניף, חשבון) that was used for all payment types. This didn't match real-world requirements where:
- Credit cards need installments, deal type, card type, and last 4 digits
- Checks need bank, branch, account, and check number
- Digital wallets need payer account and transaction reference
- Some types need only a transaction reference
- Withholding tax needs explanatory text instead of input fields

## Solution

### 1. Created PaymentDetailsSection Component

**File:** `app/dashboard/documents/receipt/PaymentDetailsSection.tsx`

A reusable component that:
- Receives `payment: PaymentRow` and `onUpdate: (updates: Partial<PaymentRow>) => void`
- Renders different field layouts based on `payment.method`
- Maintains consistent styling across all payment types
- Uses TypeScript for type safety

### 2. Extended PaymentRow Type

**File:** `app/dashboard/documents/receipt/actions.ts`

Added fields to support all payment types:

```typescript
export type PaymentRow = {
  method: PaymentMethod | "";
  date: string;
  amount: number;
  currency: string;
  
  // Credit card fields
  cardInstallments?: number;
  cardDealType?: string;
  cardType?: string;
  cardLastDigits?: string;
  
  // Bank transfer fields
  bankAccount?: string;
  bankBranch?: string;
  bankName?: string; // legacy, still used
  
  // Check fields
  checkBank?: string;
  checkBranch?: string;
  checkAccount?: string;
  checkNumber?: string;
  
  // Digital wallet fields
  payerAccount?: string;
  transactionReference?: string;
  
  // Other deduction
  description?: string;
  
  // Legacy fields (deprecated but kept for compatibility)
  branch?: string;
  accountNumber?: string;
};
```

### 3. Payment Type Implementations

#### Credit Card (כרטיס אשראי)
**Layout:** 4 fields in a grid
- **תשלומים** (Installments): Select 1-12
- **סוג עסקה** (Deal Type): Select (regular, payments, credit, deferred)
- **סוג כרטיס** (Card Type): Select (Visa, Mastercard, Isracard, Amex, Diners, Other)
- **4 ספרות אחרונות** (Last 4 Digits): Text input, maxLength 4

**Fields:**
```typescript
cardInstallments?: number;
cardDealType?: string;
cardType?: string;
cardLastDigits?: string;
```

#### Bank Transfer (העברה בנקאית)
**Layout:** 3 fields in a grid
- **חשבון לקוח** (Customer Account): Text input
- **סניף** (Branch): Text input
- **בנק** (Bank): Text input

**Fields:**
```typescript
bankAccount?: string;
bankBranch?: string;
bankName?: string;
```

#### Check (צ'ק)
**Layout:** 4 fields in a grid
- **בנק לקוח** (Customer Bank): Text input
- **סניף לקוח** (Customer Branch): Text input
- **חשבון לקוח** (Customer Account): Text input
- **מס' הצ'ק** (Check Number): Text input

**Fields:**
```typescript
checkBank?: string;
checkBranch?: string;
checkAccount?: string;
checkNumber?: string;
```

#### Cash (מזומן)
**Layout:** Single full-width field
- **מס' העסקה** (Transaction Reference): Text input

**Fields:**
```typescript
transactionReference?: string;
```

#### Digital Wallets
**Applies to:** Bit, PayBox, PayPal, Apple Pay, Google Pay, Payoneer, Colu, Pay

**Layout:** 2 fields in a grid
- **חשבון משלם (לא חובה)** (Payer Account - Optional): Text input
- **מס' העסקה (לא חובה)** (Transaction Reference - Optional): Text input

**Fields:**
```typescript
payerAccount?: string;
transactionReference?: string;
```

#### Partial Employee Deduction (ניכוי חלק עובד טל"א)
**Layout:** Single full-width field
- **מס' העסקה** (Transaction Reference): Text input

**Fields:**
```typescript
transactionReference?: string;
```

#### Withholding Tax (ניכוי במקור)
**Layout:** Explanatory text box (NO input fields)

Displays styled informational text:
- Line 1 (underlined): "הסכום ששולם למס הכנסה על ידי הלקוח, להסבר"
- Line 2 (bold): "הסכום צריך להיות חיובי אם המסמך חיובי"

**Fields:** None (informational only)

#### Vouchers & Crypto
**Applies to:** V-CHECK, שווה כסף, שובר מתנה, שובר BuyME, אתריום, ביטקוין

**Layout:** Single full-width field
- **מס' העסקה** (Transaction Reference): Text input

**Fields:**
```typescript
transactionReference?: string;
```

#### Other Deduction (ניכוי אחר)
**Layout:** Single full-width field
- **תיאור** (Description): Text input

**Fields:**
```typescript
description?: string;
```

## Payment Methods Supported

Full list of payment methods (22 total):

1. העברה בנקאית (Bank Transfer)
2. Bit
3. PayBox
4. כרטיס אשראי (Credit Card)
5. מזומן (Cash)
6. צ'ק (Check)
7. PayPal
8. Payoneer
9. Google Pay
10. Apple Pay
11. ביטקוין (Bitcoin)
12. אתריום (Ethereum)
13. שובר BuyME (BuyME Voucher)
14. שובר מתנה (Gift Voucher)
15. שווה כסף (Store Credit)
16. V-CHECK
17. Colu
18. Pay
19. ניכוי במקור (Withholding Tax)
20. ניכוי חלק עובד טל"א (Partial Employee Deduction)
21. ניכוי אחר (Other Deduction)

## Design Consistency

All fields maintain the same styling as the existing form:

```typescript
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
```

- RTL layout support (Hebrew text alignment)
- Consistent border radius (8px)
- Consistent border color (#d1d5db)
- Consistent padding (8px for inputs)
- Consistent font sizes (14px inputs, 13px labels)

## Integration with Existing Form

### ReceiptFormClient.tsx Changes

1. **Import:** Added `import PaymentDetailsSection from "./PaymentDetailsSection"`

2. **Payment Methods:** Added "Pay" to the `PAYMENT_METHODS` array

3. **Table Row:** Replaced the hard-coded 3-field layout with:
   ```tsx
   <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
     <PaymentDetailsSection
       payment={row}
       onUpdate={(updates) => updatePaymentRow(i, updates)}
     />
   </td>
   ```

4. **Null Check:** Fixed TypeScript error in `onSelectCustomer` callback:
   ```tsx
   onSelectCustomer={(customer) => {
     if (customer) {
       setCustomerId(customer.id);
     }
   }}
   ```

## Data Flow

1. **User selects payment type** → `updatePaymentRow(i, { method: "..." })`
2. **PaymentDetailsSection re-renders** with appropriate fields for that type
3. **User fills in type-specific fields** → `onUpdate({ fieldName: value })`
4. **Parent calls** `updatePaymentRow(i, updates)` to merge changes
5. **State updates** → Component re-renders with new values

## Backward Compatibility

Legacy fields are preserved for compatibility:
- `bankName`, `branch`, `accountNumber` (originally used for all types)
- These are still populated by Bank Transfer but are optional everywhere

New code uses more specific field names:
- `bankAccount` instead of `accountNumber`
- `bankBranch` instead of `branch`
- Type-specific prefixes (`card*`, `check*`, etc.)

## Testing Checklist

- [ ] All 22 payment methods render correct fields
- [ ] Field values persist when switching between payments
- [ ] "ניכוי במקור" shows explanatory text (no inputs)
- [ ] Credit card installments dropdown works (1-12)
- [ ] Check fields accept text input correctly
- [ ] Digital wallets show 2 optional fields
- [ ] Form submission includes all new fields in payload
- [ ] Preview page displays payment details correctly
- [ ] PDF generation includes new payment fields
- [ ] RTL layout works for all field types
- [ ] Null/undefined values don't cause errors

## Files Modified

1. `app/dashboard/documents/receipt/PaymentDetailsSection.tsx` (NEW)
   - 339 lines
   - Dedicated component for payment-specific fields
   
2. `app/dashboard/documents/receipt/actions.ts`
   - Added "Pay" to `PaymentMethod` type
   - Extended `PaymentRow` with 11 new optional fields
   
3. `app/dashboard/documents/receipt/ReceiptFormClient.tsx`
   - Added import for `PaymentDetailsSection`
   - Added "Pay" to `PAYMENT_METHODS` array
   - Replaced hard-coded 3-field layout with `<PaymentDetailsSection />`
   - Fixed null-check TypeScript error

## Future Enhancements

1. **Field Validation**
   - Add regex validation for card last 4 digits (numbers only)
   - Validate check numbers format
   - Validate transaction reference formats

2. **Conditional Required Fields**
   - Mark certain fields as required for specific payment types
   - Show visual indicators (red asterisk) for required fields

3. **Search/Autocomplete**
   - Add bank search for Bank Transfer and Check
   - Add branch autocomplete based on selected bank

4. **Smart Defaults**
   - Pre-fill common values (e.g., installments = 1 for credit cards)
   - Remember last-used card type per user

5. **Payment History**
   - Show recently used payment accounts
   - Quick-fill from previous receipts

6. **Localization**
   - Support English field labels
   - Multi-language payment type names

---

**Status:** ✅ Implementation complete. All 22 payment types supported with type-specific fields. Build successful with no TypeScript errors (after type cache refresh).
