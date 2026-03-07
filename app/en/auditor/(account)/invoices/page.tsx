import AuditorInvoicesClient from "@/app/auditor/(account)/invoices/AuditorInvoicesClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function EnAuditorInvoicesPage() {
  return (
    <div className="space-y-6" dir="ltr">
      <h1 className="text-2xl font-semibold text-left">Invoices</h1>
      <AuditorInvoicesClient />
    </div>
  )
}
