import Link from "next/link"
import { FileText, Receipt, FileCheck, Ban, ArrowLeft } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type DocumentType = {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  href: string
  enabled: boolean
}

const documentTypes: DocumentType[] = [
  {
    id: "receipt",
    name: "קבלה",
    description: "יצירת קבלה למסירת תשלום",
    icon: <Receipt className="h-6 w-6" />,
    href: "/dashboard/incomes/documents/new/receipt",
    enabled: true,
  },
  {
    id: "tax-invoice",
    name: "חשבונית מס",
    description: "חשבונית מס רגילה",
    icon: <FileText className="h-6 w-6" />,
    href: "/dashboard/incomes/documents/new/invoice",
    enabled: true,
  },
  {
    id: "invoice-receipt",
    name: "חשבונית מס / קבלה",
    description: "חשבונית מס משולבת עם קבלה",
    icon: <FileCheck className="h-6 w-6" />,
    href: "/dashboard/incomes/documents/new/invoiceReceipt",
    enabled: true,
  },
  {
    id: "credit-note",
    name: "חשבונית זיכוי",
    description: "חשבונית זיכוי",
    icon: <FileText className="h-6 w-6" />,
    href: "/dashboard/incomes/documents/new/creditNote",
    enabled: true,
  },
  {
    id: "quote",
    name: "הצעת מחיר",
    description: "יצירת הצעת מחיר ללקוח",
    icon: <FileText className="h-6 w-6" />,
    href: "#",
    enabled: false,
  },
  {
    id: "delivery-note",
    name: "תעודת משלוח",
    description: "תעודת משלוח למוצרים",
    icon: <FileText className="h-6 w-6" />,
    href: "#",
    enabled: false,
  },
  {
    id: "credit-invoice",
    name: "חשבונית זיכוי",
    description: "זיכוי ללקוח",
    icon: <Ban className="h-6 w-6" />,
    href: "#",
    enabled: false,
  },
]

export default function NewDocumentPage() {
  return (
    <div className="ui-container py-8 space-y-8" dir="rtl">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/documents">
            <Button variant="ghost" size="icon" className="text-muted-fg hover:text-fg">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="ui-page-title">יצירת מסמך חדש</h1>
            <p className="ui-page-subtitle">בחר את סוג המסמך שברצונך ליצור</p>
          </div>
        </div>
      </div>

      {/* Document Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentTypes.map((docType) => {
          if (docType.enabled) {
            return (
              <Link key={docType.id} href={docType.href} className="group">
                <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 p-3 bg-primary/10 group-hover:bg-primary/20 rounded-ui transition-colors">
                        <div className="text-primary">
                          {docType.icon}
                        </div>
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
            )
          }

          return (
            <Card key={docType.id} className="h-full opacity-60 cursor-not-allowed">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-3 bg-muted rounded-ui">
                    <div className="text-muted-fg">
                      {docType.icon}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-muted-fg mb-1.5">
                      {docType.name}
                    </h3>
                    <p className="text-sm text-muted-fg mb-3 leading-relaxed">
                      {docType.description}
                    </p>
                    <span className="inline-block text-xs text-muted-fg bg-muted px-2.5 py-1 rounded-ui">
                      לא זמין כרגע
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
