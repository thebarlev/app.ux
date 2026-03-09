import AuditorInvoicesClient from "@/app/auditor/(account)/invoices/AuditorInvoicesClient"
import type { Metadata } from "next"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Invoices | VOW Auditor",
  description: "View and download your subscription invoices. Professional tax invoices for your auditor account.",
}

export default function EnAuditorInvoicesPage() {
  return (
    <div className="space-y-6" dir="ltr">
      <div>
        <h1 className="text-2xl font-semibold text-left">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your subscription invoices — view and download anytime.
        </p>
      </div>
      <AuditorInvoicesClient language="en" />
    </div>
  )
}
