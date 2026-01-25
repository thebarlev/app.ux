import Link from "next/link";
import { FileText, FileCheck, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DocumentType = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  enabled: boolean;
};

const documentTypes: DocumentType[] = [
  {
    id: "quote",
    name: "הצעת מחיר",
    description: "יצירת הצעת מחיר",
    icon: <FileText className="h-6 w-6" />,
    href: "/business/documents/new/quote",
    enabled: true,
  },
  {
    id: "proforma",
    name: "חשבון עסקה (דרישת תשלום)",
    description: "יצירת חשבון עסקה",
    icon: <FileCheck className="h-6 w-6" />,
    href: "/business/documents/new/proforma",
    enabled: true,
  },
  {
    id: "workOrder",
    name: "הזמנת עבודה",
    description: "יצירת הזמנת עבודה",
    icon: <FileText className="h-6 w-6" />,
    href: "/business/documents/new/workOrder",
    enabled: true,
  },
  {
    id: "deliveryNote",
    name: "תעודת משלוח",
    description: "יצירת תעודת משלוח",
    icon: <FileText className="h-6 w-6" />,
    href: "/business/documents/new/deliveryNote",
    enabled: true,
  },
  {
    id: "returnNote",
    name: "תעודת החזרה",
    description: "יצירת תעודת החזרה",
    icon: <FileText className="h-6 w-6" />,
    href: "/business/documents/new/returnNote",
    enabled: true,
  },
  {
    id: "purchaseOrder",
    name: "הזמנת רכש",
    description: "יצירת הזמנת רכש",
    icon: <FileText className="h-6 w-6" />,
    href: "/business/documents/new/purchaseOrder",
    enabled: true,
  },
  {
    id: "selfInvoice",
    name: "חשבונית עצמית",
    description: "יצירת חשבונית עצמית",
    icon: <FileText className="h-6 w-6" />,
    href: "/business/documents/new/selfInvoice",
    enabled: true,
  },
  {
    id: "selfCreditNote",
    name: "חשבונית זיכוי עצמית",
    description: "יצירת חשבונית זיכוי עצמית",
    icon: <FileText className="h-6 w-6" />,
    href: "/business/documents/new/selfCreditNote",
    enabled: true,
  },
];

export default function NewBusinessDocumentPage() {
  return (
    <div className="ui-container py-8 space-y-8" dir="rtl">
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="text-muted-fg hover:text-fg">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="ui-page-title">ניהול שוטף</h1>
            <p className="ui-page-subtitle">בחר את סוג המסמך שברצונך ליצור</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentTypes.map((docType) => (
          <Link key={docType.id} href={docType.href} className="group">
            <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-3 bg-primary/10 group-hover:bg-primary/20 rounded-ui transition-colors">
                    <div className="text-primary">{docType.icon}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-card-fg mb-1.5 group-hover:text-primary transition-colors">
                      {docType.name}
                    </h3>
                    <p className="text-sm text-muted-fg leading-relaxed">
                      {docType.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
