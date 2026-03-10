import AuditorSubscriptionClient from "./AuditorSubscriptionClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function AuditorSubscriptionPage() {
  return <AuditorSubscriptionClient locale="he" basePath="/auditor" />
}
