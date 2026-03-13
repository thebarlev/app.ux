import AuditorSettingsClient from "@/app/auditor/(account)/settings/AuditorSettingsClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function EnAuditorSettingsPage() {
  return (
    <div className="space-y-6" dir="ltr">
      <h1 className="text-2xl font-semibold text-left">Settings & profile</h1>
      <AuditorSettingsClient locale="en" />
    </div>
  )
}
