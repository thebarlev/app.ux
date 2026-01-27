"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type ChainNewDocumentKind = "deliveryNote" | "tax_invoice" | "invoiceReceipt" | "receipt" | "credit_note";

const LABELS: Record<ChainNewDocumentKind, string> = {
  deliveryNote: "תעודת משלוח",
  tax_invoice: "חשבונית מס",
  invoiceReceipt: "חשבונית מס / קבלה",
  receipt: "קבלה",
  credit_note: "חשבונית זיכוי",
};

export default function ChainNewDocumentDialog(props: {
  onSelect: (kind: ChainNewDocumentKind) => void;
  sourceDocumentType?: string;
  children?: React.ReactNode;
}) {
  const getAvailableDocumentTypes = (): ChainNewDocumentKind[] => {
    const sourceType = props.sourceDocumentType;
    
    // חשבונית מס - קבלה ותעודת משלוח + זיכוי
    if (sourceType === 'tax_invoice') {
      return ['receipt', 'deliveryNote', 'credit_note'];
    }
    
    // חשבונית מס/קבלה - תעודת משלוח + זיכוי
    if (sourceType === 'invoice_receipt') {
      return ['deliveryNote', 'credit_note'];
    }
    
    // קבלה - תעודת משלוח + זיכוי
    if (sourceType === 'receipt') {
      return ['deliveryNote', 'credit_note'];
    }
    
    // כל שאר המסמכים - כל האפשרויות
    return ['deliveryNote', 'tax_invoice', 'invoiceReceipt', 'receipt'];
  };

  const availableTypes = getAvailableDocumentTypes();

  return (
    <Popover>
      <PopoverTrigger asChild>
        {props.children}
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        side="top"
        className="w-[280px]"
        style={{ direction: "rtl" }}
      >
        <div className="space-y-2">
          <h4 className="font-medium text-[18px] mb-3">הפקת מסמך חדש</h4>
          <div className="grid gap-2">
            {availableTypes.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                className="justify-start text-right hover:bg-[#F5F7FA] text-[16px]"
                onClick={() => {
                  props.onSelect(kind);
                }}
              >
                {LABELS[kind]}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

