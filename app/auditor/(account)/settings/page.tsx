import AuditorSettingsClient from "./AuditorSettingsClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function AuditorSettingsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-semibold text-right">הגדרות ופרטים אישיים</h1>
      <AuditorSettingsClient />
    </div>
  )
}
