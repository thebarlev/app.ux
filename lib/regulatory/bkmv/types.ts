export type BkmvRecordCode = "A100" | "B100" | "B110" | "C100" | "D110" | "D120" | "M100" | "Z900";

export type BkmvAlign = "left" | "right";

export type BkmvFieldSpec = {
  name: string;
  length: number;
  align: BkmvAlign;
  padChar: " " | "0";
  required: boolean;
};

export type BkmvRecordSpec = {
  code: BkmvRecordCode;
  fields: BkmvFieldSpec[];
};

export type BkmvSpec = {
  version: string;
  records: Record<BkmvRecordCode, BkmvRecordSpec>;
};

export type BkmvContext = {
  companyId: string;
  companyTaxId: string; // ח.פ / עוסק
  companyName: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  generatedAtIso: string; // ISO timestamp
};

export type BkmvDocument = {
  id: string;
  documentType: string;
  documentNumber: string | null;
  issueDate: string | null; // YYYY-MM-DD
  createdAt: string;
  currency: string | null;
  totalAmount: number | null;
};

export type BkmvLineItem = {
  documentId: string;
  lineNumber: number;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  currency: string | null;
};

