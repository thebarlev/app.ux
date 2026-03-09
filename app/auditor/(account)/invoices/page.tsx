import AuditorInvoicesClient from "./AuditorInvoicesClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function AuditorInvoicesPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-semibold text-right">חשבוניות</h1>
        <p className="mt-1 text-sm text-muted-foreground text-right">
          חשבוניות המנוי שלך — צפייה והורדה בכל עת.
        </p>
      </div>
      <AuditorInvoicesClient language="he" />
    </div>
  )
}
