import AuditorInvoicesClient from "./AuditorInvoicesClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function AuditorInvoicesPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-semibold text-right">חשבוניות</h1>
      <AuditorInvoicesClient />
    </div>
  )
}
