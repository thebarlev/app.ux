"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AuditorSettingsClient() {
  const [companyName, setCompanyName] = useState("")
  const [phone, setPhone] = useState("")
  const [mobilePhone, setMobilePhone] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/auditor/settings")
      .then((r) => r.json().catch(() => null))
      .then((j: any) => {
        if (cancelled) return
        if (j?.ok === true) {
          setCompanyName(j.company_name || "")
          setPhone(j.phone || "")
          setMobilePhone(j.mobile_phone || "")
        } else {
          setError(j?.error || "שגיאה בטעינה")
        }
      })
      .catch(() => {
        if (!cancelled) setError("שגיאה בטעינה")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      const r = await fetch("/api/auditor/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          phone: phone.trim(),
          mobile_phone: mobilePhone.trim(),
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || "שגיאה בשמירה")
      setSuccess(true)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card id="personal">
      <CardHeader>
        <CardTitle className="text-right">פרטים אישיים</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-ui border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</div>
            )}
            {success && (
              <div className="rounded-ui border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700">
                נשמר בהצלחה
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">שם החברה</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="text-right"
                dir="rtl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">טלפון</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                dir="ltr"
                className="text-left"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">נייד</label>
              <Input
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                type="tel"
                dir="ltr"
                className="text-left"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  שומר…
                </>
              ) : (
                "שמור"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
