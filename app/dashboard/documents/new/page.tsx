import Link from "next/link"
import { FileText, Receipt, FileCheck, Ban } from "lucide-react"

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
    icon: <Receipt className="h-8 w-8" />,
    href: "/dashboard/documents/receipt",
    enabled: true,
  },
  {
    id: "tax-invoice",
    name: "חשבונית מס",
    description: "חשבונית מס רגילה",
    icon: <FileText className="h-8 w-8" />,
    href: "#",
    enabled: false,
  },
  {
    id: "tax-invoice-receipt",
    name: "חשבונית מס קבלה",
    description: "חשבונית מס משולבת עם קבלה",
    icon: <FileCheck className="h-8 w-8" />,
    href: "#",
    enabled: false,
  },
  {
    id: "quote",
    name: "הצעת מחיר",
    description: "יצירת הצעת מחיר ללקוח",
    icon: <FileText className="h-8 w-8" />,
    href: "#",
    enabled: false,
  },
  {
    id: "delivery-note",
    name: "תעודת משלוח",
    description: "תעודת משלוח למוצרים",
    icon: <FileText className="h-8 w-8" />,
    href: "#",
    enabled: false,
  },
  {
    id: "credit-invoice",
    name: "חשבונית זיכוי",
    description: "זיכוי ללקוח",
    icon: <Ban className="h-8 w-8" />,
    href: "#",
    enabled: false,
  },
]

/* Updated to use Design Tokens - Jan 5, 2026 */
export default function NewDocumentPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-fg mb-2">יצירת מסמך חדש</h1>
        <p className="text-muted-fg">בחר את סוג המסמך שברצונך ליצור</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentTypes.map((docType) => {
          if (docType.enabled) {
            return (
              <Link
                key={docType.id}
                href={docType.href}
                className="group block p-6 bg-card hover:bg-muted border border-border hover:border-primary rounded-2xl transition-all"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-primary/20 group-hover:bg-primary/30 rounded-xl transition">
                    {docType.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-card-fg mb-1">
                      {docType.name}
                    </h3>
                    <p className="text-sm text-muted-fg">{docType.description}</p>
                  </div>
                </div>
              </Link>
            )
          }

          return (
            <div
              key={docType.id}
              className="p-6 bg-card border border-border rounded-2xl opacity-50 cursor-not-allowed"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-muted rounded-xl">
                  {docType.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-muted-fg mb-1">
                    {docType.name}
                  </h3>
                  <p className="text-sm text-muted-fg mb-2">{docType.description}</p>
                  <span className="text-xs text-muted-fg bg-muted px-2 py-1 rounded">
                    לא זמין כרגע
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
