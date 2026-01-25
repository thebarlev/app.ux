"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getInvoiceReceiptPreviewUrlAction } from "@/app/dashboard/documents/invoice-receipt/actions";
import { Download, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type InvoiceReceiptRow = {
  id: string;
  document_number: string | null;
  document_type: string;
  issue_date: string | null;
  created_at: string | null;
  customer_name: string | null;
  document_description: string | null;
  subtotal?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  total_amount: number | null;
  currency: string | null;
  document_status: string;
  language?: "he" | "en" | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
};

type CompanyRow = {
  company_name?: string | null;
  registration_number?: string | null;
  company_number?: string | null;
  email?: string | null;
} | null;

type CustomerRow = {
  name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  mobile?: string | null;
} | null;

type ItemRow = {
  label: string | null;
  sku: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  currency: string | null;
  vatMode: "before" | "included" | null;
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("he-IL");
  } catch {
    return "—";
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("he-IL");
  } catch {
    return "—";
  }
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || typeof amount !== "number") return "—";
  const curr = currency || "ILS";
  const formatted = amount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${curr === "ILS" ? "₪" : curr}`;
}

async function downloadPdf(documentId: string, opts: { issue: "original" | "copy"; lang: "he" | "en"; fileName: string }) {
  const url = `/api/documents/${documentId}/pdf?issue=${opts.issue}&lang=${opts.lang}`;
  const res = await fetch(url);
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const message = (json && (json.message || json.details || json.error)) || res.statusText;
    throw new Error(message);
  }
  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error("Downloaded PDF is empty");
  const pdfBlob = new Blob([blob], { type: "application/pdf" });
  const downloadUrl = window.URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = opts.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

type ItemLineItemRow = {
  label: string | null;
  sku: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  currency: string | null;
  vatMode: "before" | "included" | null;
};

function formatVatMode(value: ItemRow["vatMode"]): string {
  if (value === "included") return "כולל";
  if (value === "before") return "לפני";
  return "—";
}

export default function InvoiceReceiptSummaryClient(props: {
  invoiceReceipt: InvoiceReceiptRow;
  company: CompanyRow;
  customer: CustomerRow;
  items: ItemRow[];
}) {
  const { invoiceReceipt, company, customer, items } = props;
  const documentNumber = invoiceReceipt.document_number || "—";
  const currency = invoiceReceipt.currency || "₪";
  const subtotal = invoiceReceipt.subtotal || 0;
  const vatRate = invoiceReceipt.vat_rate || 0;
  const vatAmount = invoiceReceipt.vat_amount || 0;
  const totalAmount = invoiceReceipt.total_amount || 0;

  const title = useMemo(() => {
    const n = invoiceReceipt.document_number || "—";
    return `חשבונית מס / קבלה ${n}`;
  }, [invoiceReceipt.document_number]);

  const [itemsState, setItemsState] = useState<ItemLineItemRow[]>([]);

  useEffect(() => {
    setItemsState(items);
  }, [items]);

  const handlePreview = async () => {
    const res = await getInvoiceReceiptPreviewUrlAction(invoiceReceipt.id);
    if (!res.ok || !res.url) {
      throw new Error(res.message || "שגיאה בהכנת תצוגה מקדימה");
    }
    window.open(res.url, "_blank");
  };

  const handleDownloadOriginal = async () => {
    const fileName = `${documentNumber}.pdf`;
    await downloadPdf(invoiceReceipt.id, { issue: "original", lang: "he", fileName });
  };

  const handleDownloadCopy = async () => {
    const fileName = `${documentNumber}-he.pdf`;
    await downloadPdf(invoiceReceipt.id, { issue: "copy", lang: "he", fileName });
  };

  return (
    <div className="ui-container py-8 space-y-8" dir="rtl">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="ui-page-title">{title}</h1>
            <p className="ui-page-subtitle">
              נוצר בתאריך {formatDateTime(invoiceReceipt.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleDownloadCopy}>
              <Download className="h-4 w-4 ml-2" />
              הורדת העתק
            </Button>
            <Button variant="secondary" onClick={handleDownloadOriginal}>
              <Download className="h-4 w-4 ml-2" />
              הורדת מקור
            </Button>
            <Button variant="default" onClick={handlePreview}>
              <Eye className="h-4 w-4 ml-2" />
              צפייה במסמך
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-lg font-semibold">פרטי המסמך</div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">מספר מסמך</div>
            <div className="text-base font-semibold">{documentNumber}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">תאריך מסמך</div>
            <div className="text-base font-semibold">{formatDate(invoiceReceipt.issue_date)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">לקוח</div>
            <div className="text-base font-semibold">{invoiceReceipt.customer_name || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">סטטוס</div>
            <div className="text-base font-semibold">{invoiceReceipt.document_status}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-lg font-semibold">פרטי פריטים</div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">לייבל</th>
                <th className="py-2">מק״ט</th>
                <th className="py-2">פירוט</th>
                <th className="py-2">כמות</th>
                <th className="py-2">מחיר ליחידה</th>
                <th className="py-2">מטבע</th>
                <th className="py-2">מע״מ</th>
                <th className="py-2">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {itemsState.map((item, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-2">{item.label || "—"}</td>
                  <td className="py-2">{item.sku || "—"}</td>
                  <td className="py-2">{item.description || "—"}</td>
                  <td className="py-2">{item.quantity ?? "—"}</td>
                  <td className="py-2">{formatAmount(item.unitPrice ?? null, currency)}</td>
                  <td className="py-2">{item.currency || currency}</td>
                  <td className="py-2">{formatVatMode(item.vatMode)}</td>
                  <td className="py-2">{formatAmount(item.lineTotal ?? null, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-lg font-semibold">סיכום</div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-2">
            <div className="text-muted-foreground">סה״כ לפני מע״מ</div>
            <div className="font-semibold">{formatAmount(subtotal, currency)}</div>
          </div>
          {vatRate > 0 ? (
            <div className="flex items-center justify-between py-2">
              <div className="text-muted-foreground">מע״מ ({vatRate}%)</div>
              <div className="font-semibold">{formatAmount(vatAmount, currency)}</div>
            </div>
          ) : null}
          <div className="flex items-center justify-between py-2 font-semibold text-primary">
            <div>סה״כ כולל מע״מ</div>
            <div>{formatAmount(totalAmount, currency)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
