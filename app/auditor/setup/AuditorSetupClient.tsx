"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

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
  const [keyword1, setKeyword1] = useState("")
  const [keyword2, setKeyword2] = useState("")
  const [keyword3, setKeyword3] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [seoGoal, setSeoGoal] = useState("")
  const [regionType, setRegionType] = useState("")
  const [regionValue, setRegionValue] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const r = await fetch("/api/auditor/lead/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          website_url: websiteUrl.trim() || undefined,
          keyword_1: keyword1.trim() || undefined,
          keyword_2: keyword2.trim() || undefined,
          keyword_3: keyword3.trim() || undefined,
          business_type: businessType.trim() || undefined,
          seo_goal: seoGoal.trim() || undefined,
          region_type: regionType.trim() || undefined,
          region_value: regionValue.trim() || undefined,
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

                <div className="auth-field">
                  <FloatingInput
                    label="מילת מפתח 1"
                    id="keyword_1"
                    placeholder=""
                    value={keyword1}
                    onChange={(e) => setKeyword1(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="מילת מפתח 2"
                    id="keyword_2"
                    placeholder=""
                    value={keyword2}
                    onChange={(e) => setKeyword2(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="מילת מפתח 3"
                    id="keyword_3"
                    placeholder=""
                    value={keyword3}
                    onChange={(e) => setKeyword3(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="סוג עסק"
                    id="business_type"
                    placeholder=""
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="מטרת SEO"
                    id="seo_goal"
                    placeholder=""
                    value={seoGoal}
                    onChange={(e) => setSeoGoal(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="סוג אזור"
                    id="region_type"
                    placeholder=""
                    value={regionType}
                    onChange={(e) => setRegionType(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="ערך אזור"
                    id="region_value"
                    placeholder=""
                    value={regionValue}
                    onChange={(e) => setRegionValue(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
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
