export type DocumentCategory = "income" | "business";

export type DocumentConfig = {
  uiKey: string;
  dbValue: string;
  label: string;
  prefix: string;
  category: DocumentCategory;
  routeSegment: string;
};

const DOCUMENT_CONFIGS: Record<string, DocumentConfig> = {
  receipt: {
    uiKey: "receipt",
    dbValue: "receipt",
    label: "קבלה",
    prefix: "REC-",
    category: "income",
    routeSegment: "receipt",
  },
  tax_invoice: {
    uiKey: "tax_invoice",
    dbValue: "tax_invoice",
    label: "חשבונית מס",
    prefix: "INV-",
    category: "income",
    routeSegment: "tax-invoice",
  },
  invoiceReceipt: {
    uiKey: "invoiceReceipt",
    dbValue: "invoice_receipt",
    label: "חשבונית מס / קבלה",
    prefix: "INVREC-",
    category: "income",
    routeSegment: "invoice-receipt",
  },
  creditNote: {
    uiKey: "creditNote",
    dbValue: "credit_note",
    label: "חשבונית זיכוי",
    prefix: "CRN-",
    category: "income",
    routeSegment: "credit-note",
  },
  quote: {
    uiKey: "quote",
    dbValue: "quote",
    label: "הצעת מחיר",
    prefix: "QUOTE-",
    category: "business",
    routeSegment: "quote",
  },
  proforma: {
    uiKey: "proforma",
    dbValue: "proforma",
    label: "חשבון עסקה (דרישת תשלום)",
    prefix: "PROF-",
    category: "business",
    routeSegment: "proforma",
  },
  workOrder: {
    uiKey: "workOrder",
    dbValue: "work_order",
    label: "הזמנת עבודה",
    prefix: "WO-",
    category: "business",
    routeSegment: "work-order",
  },
  deliveryNote: {
    uiKey: "deliveryNote",
    dbValue: "delivery_note",
    label: "תעודת משלוח",
    prefix: "DEL-",
    category: "business",
    routeSegment: "delivery-note",
  },
  returnNote: {
    uiKey: "returnNote",
    dbValue: "return_note",
    label: "תעודת החזרה",
    prefix: "RET-",
    category: "business",
    routeSegment: "return-note",
  },
  purchaseOrder: {
    uiKey: "purchaseOrder",
    dbValue: "purchase_order",
    label: "הזמנת רכש",
    prefix: "PO-",
    category: "business",
    routeSegment: "purchase-order",
  },
  selfInvoice: {
    uiKey: "selfInvoice",
    dbValue: "self_invoice",
    label: "חשבונית עצמית",
    prefix: "SELF-",
    category: "business",
    routeSegment: "self-invoice",
  },
  selfCreditNote: {
    uiKey: "selfCreditNote",
    dbValue: "self_credit_note",
    label: "חשבונית זיכוי עצמית",
    prefix: "SCN-",
    category: "business",
    routeSegment: "self-credit-note",
  },
};

export const BUSINESS_DOCUMENT_TYPES = Object.values(DOCUMENT_CONFIGS)
  .filter((config) => config.category === "business")
  .map((config) => config.uiKey);

export function getDocumentConfig(documentType: string): DocumentConfig | null {
  return DOCUMENT_CONFIGS[documentType] || null;
}

export function getAllDocumentConfigs(): DocumentConfig[] {
  return Object.values(DOCUMENT_CONFIGS);
}

export function getDocumentConfigByRouteSegment(routeSegment: string): DocumentConfig | null {
  return (
    Object.values(DOCUMENT_CONFIGS).find(
      (config) => config.routeSegment === routeSegment
    ) || null
  );
}
