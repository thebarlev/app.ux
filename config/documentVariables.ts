/**
 * ===================================================================
 * Document Template Variables & Select Options - Single Source of Truth
 * ===================================================================
 * 
 * מטרה: לשמור על אחידות מלאה בין כל סוגי המסמכים במערכת
 * (קבלה, חשבונית, הצעת מחיר, וכו')
 * 
 * חשוב: כאשר מוסיפים מסמך חדש, יש להשתמש בערכים האלה בדיוק!
 * אין ליצור values/keys חדשים למושגים קיימים.
 * ===================================================================
 */

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

export type SelectOption = {
  value: string
  label: string
  description?: string // הסבר נוסף (אופציונלי)
}

export type SelectCategory = {
  id: string // שם טכני (key) - ישמש בקוד ובתבניות
  label: string // שם תצוגה בעברית
  group?: string // קבוצה לוגית: "תשלום", "מסמך", "מערכת", וכו'
  options: SelectOption[]
  isDynamic?: boolean // האם הערכים נטענים מה-DB
  dependsOn?: string // אם תלוי ב-select אחר (למשל: תת-קטגוריה תלויה בקטגוריה)
}

// ===================================================================
// DOCUMENT TYPES (סוגי מסמכים)
// ===================================================================

export const DOCUMENT_TYPES = {
  RECEIPT: "receipt",
  INVOICE: "invoice", 
  TAX_INVOICE: "tax_invoice",
  QUOTE: "quote",
  DELIVERY_NOTE: "delivery_note",
  CREDIT_INVOICE: "credit_invoice",
  PROFORMA: "proforma",
} as const

export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  receipt: "קבלה",
  invoice: "חשבונית",
  tax_invoice: "חשבונית מס",
  quote: "הצעת מחיר",
  delivery_note: "תעודת משלוח",
  credit_invoice: "חשבונית זכות",
  proforma: "חשבונית פרופורמה",
}

// ===================================================================
// PAYMENT METHODS (אמצעי תשלום)
// ===================================================================
// חשוב: אלו הערכים הסטנדרטיים שכל המסמכים ישתמשו בהם

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "bit", label: "Bit" },
  { value: "paybox", label: "PayBox" },
  { value: "credit_card", label: "כרטיס אשראי" },
  { value: "cash", label: "מזומן" },
  { value: "check", label: "צ׳ק" },
  { value: "paypal", label: "PayPal" },
  { value: "payoneer", label: "Payoneer" },
  { value: "google_pay", label: "Google Pay" },
  { value: "apple_pay", label: "Apple Pay" },
  { value: "bitcoin", label: "ביטקוין" },
  { value: "ethereum", label: "אתריום" },
  { value: "buyme_voucher", label: "שובר BuyME" },
  { value: "gift_voucher", label: "שובר מתנה" },
  { value: "cash_equivalent", label: "שווה כסף" },
  { value: "vcheck", label: "V-CHECK" },
  { value: "colu", label: "Colu" },
  { value: "pay", label: "Pay" },
  { value: "tax_deduction", label: "ניכוי במקור" },
  { value: "employee_deduction", label: "ניכוי חלק עובד טל״א" },
  { value: "other_deduction", label: "ניכוי אחר" },
] as const

// ===================================================================
// CREDIT CARD TYPES (סוגי כרטיסי אשראי)
// ===================================================================

export const CARD_TYPES = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "isracard", label: "ישראכרט" },
  { value: "amex", label: "American Express" },
  { value: "diners", label: "Diners" },
  { value: "other", label: "אחר" },
] as const

// ===================================================================
// CREDIT CARD DEAL TYPES (סוגי עסקאות כרטיס אשראי)
// ===================================================================

export const CARD_DEAL_TYPES = [
  { value: "regular", label: "רגיל" },
  { value: "payments", label: "תשלומים" },
  { value: "credit", label: "קרדיט" },
  { value: "deferred", label: "דחוי" },
] as const

// ===================================================================
// CHECK TYPES (סוגי צ'קים)
// ===================================================================

export const CHECK_TYPES = [
  { value: "regular", label: "רגיל" },
  { value: "postdated", label: "דחוי" },
] as const

// ===================================================================
// CURRENCIES (מטבעות)
// ===================================================================

export const CURRENCIES = [
  { value: "ILS", label: "₪", symbol: "₪" },
  { value: "USD", label: "$", symbol: "$" },
  { value: "EUR", label: "€", symbol: "€" },
  { value: "GBP", label: "£", symbol: "£" },
] as const

// ===================================================================
// LANGUAGES (שפות)
// ===================================================================

export const LANGUAGES = [
  { value: "he", label: "עברית" },
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
] as const

// ===================================================================
// DOCUMENT STATUS (סטטוס מסמך)
// ===================================================================

export const DOCUMENT_STATUSES = [
  { value: "draft", label: "טיוטה" },
  { value: "issued", label: "הונפק" },
  { value: "sent", label: "נשלח" },
  { value: "paid", label: "שולם" },
  { value: "cancelled", label: "בוטל" },
  { value: "final", label: "סופי" },
] as const

// ===================================================================
// VAT TYPES (סוגי מע״מ)
// ===================================================================

export const VAT_TYPES = [
  { value: "included", label: "כולל מע״מ" },
  { value: "excluded", label: "לא כולל מע״מ" },
  { value: "exempt", label: "פטור ממע״מ" },
] as const

// ===================================================================
// TAX RATES (שיעורי מס)
// ===================================================================

export const TAX_RATES = [
  { value: "0", label: "0% - פטור" },
  { value: "17", label: "17% - מע״מ" },
  { value: "18", label: "18% - מע״מ" },
] as const

// ===================================================================
// BUSINESS TYPES (סוגי עסקים)
// ===================================================================

export const BUSINESS_TYPES = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "company", label: 'חברה בע"מ' },
  { value: "partnership", label: "שותפות" },
  { value: "nonprofit", label: 'עמותה/חל"צ' },
  { value: "other", label: "אחר" },
] as const

// ===================================================================
// SELECT CATEGORIES - MASTER CONFIGURATION
// ===================================================================
// זהו מקור האמת המרכזי לכל ה-selectים במערכת

export const SELECT_CATEGORIES: SelectCategory[] = [
  // =========================
  // קבוצה: תשלום
  // =========================
  {
    id: "payment_method",
    label: "אמצעי תשלום",
    group: "תשלום",
    options: PAYMENT_METHODS.map(pm => ({ value: pm.value, label: pm.label })),
  },
  {
    id: "card_type",
    label: "סוג כרטיס אשראי",
    group: "תשלום",
    dependsOn: "payment_method", // מוצג רק כאשר payment_method === 'credit_card'
    options: CARD_TYPES.map(ct => ({ value: ct.value, label: ct.label })),
  },
  {
    id: "card_deal_type",
    label: "סוג עסקה (כרטיס אשראי)",
    group: "תשלום",
    dependsOn: "payment_method",
    options: CARD_DEAL_TYPES.map(cdt => ({ value: cdt.value, label: cdt.label })),
  },
  {
    id: "check_type",
    label: "סוג צ׳ק",
    group: "תשלום",
    dependsOn: "payment_method", // מוצג רק כאשר payment_method === 'check'
    options: CHECK_TYPES.map(ct => ({ value: ct.value, label: ct.label })),
  },

  // =========================
  // קבוצה: מסמך
  // =========================
  {
    id: "document_type",
    label: "סוג מסמך",
    group: "מסמך",
    options: Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  },
  {
    id: "document_status",
    label: "סטטוס מסמך",
    group: "מסמך",
    options: DOCUMENT_STATUSES.map(ds => ({ value: ds.value, label: ds.label })),
  },

  // =========================
  // קבוצה: מס ומטבע
  // =========================
  {
    id: "vat_type",
    label: "סוג מע״מ",
    group: "מס",
    options: VAT_TYPES.map(vt => ({ value: vt.value, label: vt.label })),
  },
  {
    id: "tax_rate",
    label: "שיעור מס",
    group: "מס",
    options: TAX_RATES.map(tr => ({ value: tr.value, label: tr.label })),
  },
  {
    id: "currency",
    label: "מטבע",
    group: "מערכת",
    options: CURRENCIES.map(c => ({ value: c.value, label: c.label })),
  },

  // =========================
  // קבוצה: מערכת
  // =========================
  {
    id: "language",
    label: "שפה",
    group: "מערכת",
    options: LANGUAGES.map(l => ({ value: l.value, label: l.label })),
  },
  {
    id: "business_type",
    label: "סוג עסק",
    group: "מערכת",
    options: BUSINESS_TYPES.map(bt => ({ value: bt.value, label: bt.label })),
  },
]

// ===================================================================
// TEMPLATE PLACEHOLDERS (משתנים לתבניות)
// ===================================================================
// שמות אחידים לשימוש בתבניות HTML - כל המסמכים ישתמשו באותם שמות

export const TEMPLATE_PLACEHOLDERS = {
  // פרטי חברה
  company: {
    name: "{{company_name}}",
    id: "{{company_id}}",
    business_type: "{{company_business_type}}",
    registration_number: "{{company_registration_number}}",
    tax_id: "{{company_tax_id}}",
    address: "{{company_address}}",
    street: "{{company_street}}",
    city: "{{company_city}}",
    postal_code: "{{company_postal_code}}",
    phone: "{{company_phone}}",
    mobile: "{{company_mobile}}",
    email: "{{company_email}}",
    website: "{{company_website}}",
    logo_url: "{{company_logo_url}}",
    signature_url: "{{company_signature_url}}",
  },

  // פרטי לקוח
  customer: {
    id: "{{customer_id}}",
    name: "{{customer_name}}",
    tax_id: "{{customer_tax_id}}",
    email: "{{customer_email}}",
    phone: "{{customer_phone}}",
    mobile: "{{customer_mobile}}",
    address: "{{customer_address}}",
    street: "{{customer_street}}",
    city: "{{customer_city}}",
    postal_code: "{{customer_postal_code}}",
  },

  // פרטי מסמך
  document: {
    type: "{{document_type}}",
    type_label: "{{document_type_label}}", // "קבלה", "חשבונית" וכו'
    number: "{{document_number}}",
    date: "{{document_date}}",
    status: "{{document_status}}",
    language: "{{document_language}}",
    currency: "{{document_currency}}",
    description: "{{document_description}}",
    notes: "{{document_notes}}",
    footer_notes: "{{document_footer_notes}}",
  },

  // סכומים
  totals: {
    subtotal: "{{subtotal}}",
    vat_amount: "{{vat_amount}}",
    total_amount: "{{total_amount}}",
    total_in_words: "{{total_in_words}}", // סכום במילים
  },

  // תשלומים
  payment: {
    method: "{{payment_method}}",
    method_label: "{{payment_method_label}}",
    date: "{{payment_date}}",
    amount: "{{payment_amount}}",
    currency: "{{payment_currency}}",
    
    // פרטי כרטיס אשראי
    card_last_digits: "{{card_last_digits}}",
    card_type: "{{card_type}}",
    card_deal_type: "{{card_deal_type}}",
    card_installments: "{{card_installments}}",
    
    // פרטי צ'ק
    check_number: "{{check_number}}",
    check_bank: "{{check_bank}}",
    check_branch: "{{check_branch}}",
    check_account: "{{check_account}}",
    check_date: "{{check_date}}",
    check_type: "{{check_type}}",
  },

  // פריטים / שורות (לשימוש בלולאות)
  items: {
    loop_start: "{{#each items}}",
    loop_end: "{{/each}}",
    description: "{{description}}",
    quantity: "{{quantity}}",
    unit_price: "{{unit_price}}",
    total_price: "{{total_price}}",
    vat_rate: "{{vat_rate}}",
  },

  // רב-תשלום (לולאה)
  payments_list: {
    loop_start: "{{#each payments}}",
    loop_end: "{{/each}}",
    method: "{{method}}",
    amount: "{{amount}}",
    date: "{{date}}",
  },

  // helpers
  helpers: {
    format_currency: "{{formatCurrency amount}}",
    format_date: "{{formatDate date}}",
    format_percent: "{{formatPercent rate}}",
    is_payment_method: "{{#isPaymentMethod method 'credit_card'}}...{{/isPaymentMethod}}",
  },
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * מחזיר את כל הערכים של קטגוריה ספציפית
 */
export function getCategoryValues(categoryId: string): string[] {
  const category = SELECT_CATEGORIES.find(c => c.id === categoryId)
  return category ? category.options.map(o => o.value) : []
}

/**
 * מחזיר label לפי value
 */
export function getLabelByValue(categoryId: string, value: string): string | null {
  const category = SELECT_CATEGORIES.find(c => c.id === categoryId)
  if (!category) return null
  const option = category.options.find(o => o.value === value)
  return option ? option.label : null
}

/**
 * מייצא את כל הערכים של קטגוריה בפורמט clipboard-friendly
 */
export function exportCategoryValues(categoryId: string, format: "csv" | "json" | "placeholders" = "csv"): string {
  const category = SELECT_CATEGORIES.find(c => c.id === categoryId)
  if (!category) return ""

  switch (format) {
    case "csv":
      return category.options.map(o => o.value).join(", ")
    
    case "json":
      return JSON.stringify(category.options, null, 2)
    
    case "placeholders":
      return category.options
        .map(o => `{{${categoryId}.${o.value}}}`)
        .join("\n")
    
    default:
      return ""
  }
}

/**
 * מחזיר את כל ה-placeholders בפורמט רשימה
 */
export function getAllPlaceholders(): string[] {
  const placeholders: string[] = []
  
  Object.entries(TEMPLATE_PLACEHOLDERS).forEach(([section, values]) => {
    Object.values(values).forEach(placeholder => {
      if (typeof placeholder === "string") {
        placeholders.push(placeholder)
      }
    })
  })
  
  return placeholders
}
