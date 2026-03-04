"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Plus } from "lucide-react"

const BUSINESS_TYPES = [
  "משרד עורכי דין",
  "רופא",
  "רואה חשבון",
  "חנות",
  "מסעדה",
  "מטפל",
  "יועץ",
  "אחר",
]
const SEO_GOALS = ["הגדלת תנועה", "מיתוג", "קידום לוקאלי", "מכירות", "אחר"]
const REGION_TYPES = ["ארצי", "אזורי", "מקומי", "גלובלי", "אחר"]
const REGION_VALUES = ["מרכז", "צפון", "דרום", "ירושלים", "תל אביב", "חיפה", "אחר"]

export default function AuditorSetupClient(props: {
  linkId: string
  scanId: string
  token: string
}) {
  const router = useRouter()

  const linkId = String(props.linkId || "").trim()
  const scanId = String(props.scanId || "").trim()
  const token = String(props.token || "").trim()

  const checkoutUrl = useMemo(() => {
    const base = "/auditor/checkout"
    const params = new URLSearchParams()
    if (linkId) params.set("link_id", linkId)
    if (scanId) params.set("scanId", scanId)
    if (token) params.set("token", token)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }, [linkId, scanId, token])

  const [websiteUrl, setWebsiteUrl] = useState("")
  const [keywords, setKeywords] = useState<string[]>([""])
  const [businessType, setBusinessType] = useState("")
  const [businessTypeOther, setBusinessTypeOther] = useState("")
  const [seoGoal, setSeoGoal] = useState("")
  const [seoGoalOther, setSeoGoalOther] = useState("")
  const [regionType, setRegionType] = useState("")
  const [regionTypeOther, setRegionTypeOther] = useState("")
  const [regionValue, setRegionValue] = useState("")
  const [regionValueOther, setRegionValueOther] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const addKeyword = () => {
    setKeywords((k) => [...k, ""])
  }

  const setKeywordAt = (i: number, v: string) => {
    setKeywords((k) => {
      const next = [...k]
      next[i] = v
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const kw = keywords.map((k) => k.trim()).filter(Boolean)
    const businessTypeVal = businessType === "אחר" ? businessTypeOther.trim() : businessType
    const seoGoalVal = seoGoal === "אחר" ? seoGoalOther.trim() : seoGoal
    const regionTypeVal = regionType === "אחר" ? regionTypeOther.trim() : regionType
    const regionValueVal = regionValue === "אחר" ? regionValueOther.trim() : regionValue

    try {
      const r = await fetch("/api/auditor/lead/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          website_url: websiteUrl.trim() || undefined,
          keyword_1: kw[0] || undefined,
          keyword_2: kw[1] || undefined,
          keyword_3: kw[2] || undefined,
          business_type: businessTypeVal || undefined,
          seo_goal: seoGoalVal || undefined,
          region_type: regionTypeVal || undefined,
          region_value: regionValueVal || undefined,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(String(j?.error || `Failed (${r.status})`))

      router.replace(checkoutUrl)
      router.refresh()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-scope">
      <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex justify-center">
            <Image src="/brand/vow.svg" alt="Vow" width={210} height={94} priority />
          </div>

          <Card className="shadow-ui-lg auth-card">
            <CardHeader className="pb-4 mb-[15px]">
              <CardTitle className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
                פרטי העסק
              </CardTitle>
              <CardDescription className="mr-6 text-right text-[24px]">
                מלאו את הפרטים הבאים (אופציונלי) – נמשיך לתשלום
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {error ? (
                  <div
                    className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-ui text-sm font-medium text-right"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}

                <div className="auth-field">
                  <FloatingInput
                    label="כתובת האתר"
                    id="website_url"
                    type="url"
                    placeholder="https://example.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                {keywords.map((kw, i) => (
                  <div key={i} className="auth-field flex gap-2 items-end">
                    <div className="flex-1">
                      <FloatingInput
                        label={`מילת מפתח ${i + 1}`}
                        id={`keyword_${i}`}
                        placeholder="הקלד מילת מפתח"
                        value={kw}
                        onChange={(e) => setKeywordAt(i, e.target.value)}
                        className="auth-input"
                        labelClassName="auth-label"
                        labelPlacement="above"
                      />
                    </div>
                    {i === keywords.length - 1 && kw.trim() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addKeyword}
                        className="shrink-0 mb-1"
                      >
                        <Plus className="h-4 w-4 ml-1" />
                        הוסף מילת מפתח
                      </Button>
                    )}
                  </div>
                ))}

                <div className="auth-field">
                  <label className="auth-label block mb-1 text-right">סוג עסק</label>
                  <Select value={businessType || ""} onValueChange={setBusinessType}>
                    <SelectTrigger className="w-full auth-input" variant="underline">
                      <SelectValue placeholder="בחר סוג עסק" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {businessType === "אחר" && (
                    <div className="mt-2">
                      <FloatingInput
                        label="פרט סוג העסק"
                        id="business_type_other"
                        placeholder="הזן ידנית"
                        value={businessTypeOther}
                        onChange={(e) => setBusinessTypeOther(e.target.value)}
                        className="auth-input"
                        labelClassName="auth-label"
                        labelPlacement="above"
                      />
                    </div>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-label block mb-1 text-right">מטרת SEO</label>
                  <Select value={seoGoal || ""} onValueChange={setSeoGoal}>
                    <SelectTrigger className="w-full auth-input" variant="underline">
                      <SelectValue placeholder="בחר מטרה" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEO_GOALS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {seoGoal === "אחר" && (
                    <div className="mt-2">
                      <FloatingInput
                        label="פרט מטרת SEO"
                        id="seo_goal_other"
                        placeholder="הזן ידנית"
                        value={seoGoalOther}
                        onChange={(e) => setSeoGoalOther(e.target.value)}
                        className="auth-input"
                        labelClassName="auth-label"
                        labelPlacement="above"
                      />
                    </div>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-label block mb-1 text-right">סוג אזור</label>
                  <Select value={regionType || ""} onValueChange={setRegionType}>
                    <SelectTrigger className="w-full auth-input" variant="underline">
                      <SelectValue placeholder="בחר סוג אזור" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_TYPES.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {regionType === "אחר" && (
                    <div className="mt-2">
                      <FloatingInput
                        label="פרט סוג אזור"
                        id="region_type_other"
                        placeholder="הזן ידנית"
                        value={regionTypeOther}
                        onChange={(e) => setRegionTypeOther(e.target.value)}
                        className="auth-input"
                        labelClassName="auth-label"
                        labelPlacement="above"
                      />
                    </div>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-label block mb-1 text-right">ערך אזור</label>
                  <Select value={regionValue || ""} onValueChange={setRegionValue}>
                    <SelectTrigger className="w-full auth-input" variant="underline">
                      <SelectValue placeholder="בחר ערך אזור" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_VALUES.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {regionValue === "אחר" && (
                    <div className="mt-2">
                      <FloatingInput
                        label="פרט ערך אזור"
                        id="region_value_other"
                        placeholder="הזן ידנית"
                        value={regionValueOther}
                        onChange={(e) => setRegionValueOther(e.target.value)}
                        className="auth-input"
                        labelClassName="auth-label"
                        labelPlacement="above"
                      />
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={isLoading} className="w-full auth-primary-button" variant="primary">
                  {isLoading ? (
                    <>
                      <Loader2 size={19} className="h-[19px] w-[19px] shrink-0 animate-spin ml-2" />
                      ממשיכים לתשלום…
                    </>
                  ) : (
                    "המשך לתשלום"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
