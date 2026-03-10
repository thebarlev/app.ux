import AuditorSubscriptionClient from "@/app/auditor/(account)/subscription/AuditorSubscriptionClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function EnAuditorSubscriptionPage() {
  return <AuditorSubscriptionClient locale="en" basePath="/en/auditor" />
}
