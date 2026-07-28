"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { planFromLinkId, pushEvent } from "@/lib/tracking/events"
import { captureLeadCreated, resolvePageLocale } from "@/lib/analytics/posthog-events"
import { trackLead } from "@/lib/analytics/meta-pixel"

export default function AuditorRegisterClient(props: {
  linkId: string
  scanId: string
  token: string
  titleText: string
  descriptionText: string
  legalTermsText: string
  marketingText: string
  submitButtonText: string
  submitLoadingText: string
  footerQuestion: string
  footerLoginLinkText: string
  requireLegalTermsRequired: boolean
  requireMarketingRequired: boolean
  basePath?: string
  locale?: "he" | "en"
  labelFullName?: string
  labelEmail?: string
  labelPhone?: string
  labelCompanyName?: string
  labelAddress?: string
  labelWebsite?: string
  labelContactName?: string
  labelPassword?: string
  helperPassword?: string
  helperCompanyName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const basePath = props.basePath ?? "/auditor"
  const locale = props.locale ?? "he"
  const isLtr = locale === "en"

  const linkId = String(props.linkId || "").trim()
  const scanId = String(props.scanId || "").trim()
  const token = String(props.token || "").trim()

  const loginHref = linkId ? `${basePath}/login?link_id=${encodeURIComponent(linkId)}` : `${basePath}/login`
  const afterCheckout = useMemo(() => {
    const base = `${basePath}/checkout`
    const params = new URLSearchParams()
    if (linkId) params.set("link_id", linkId)
    if (scanId) params.set("scanId", scanId)
    if (token) params.set("token", token)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }, [linkId, scanId, token, basePath])

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [address, setAddress] = useState("")
  const [website, setWebsite] = useState("")
  const [contactName, setContactName] = useState("")
  const [password, setPassword] = useState("")
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false)
  const [acceptedMarketing, setAcceptedMarketing] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setError(null)
  }, [linkId, scanId, token])

  useEffect(() => {
    const trackedPlan = planFromLinkId(linkId)
    pushEvent("register_started", trackedPlan ? { plan: trackedPlan } : {})
  }, [linkId])

  const validate = () => {
    if (!fullName.trim()) return "נא למלא שם מלא"
    if (!email.trim()) return "נא למלא אימייל"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "כתובת אימייל לא תקינה"
    if (!phone.trim()) return "נא למלא טלפון"
    if (!password || password.length < 8) return "סיסמה חייבת להכיל לפחות 8 תווים"
    if (props.requireLegalTermsRequired && !acceptedLegalTerms) return "יש לאשר תנאים משפטיים כדי להמשיך"
    if (props.requireMarketingRequired && !acceptedMarketing) return "יש לאשר קבלת מידע שיווקי כדי להמשיך"
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const v = validate()
    if (v) {
      setError(v)
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()

      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      })

      if (signUpError) {
        const code = (signUpError as any)?.code ?? null
        if (code === "user_already_exists" || signUpError.message?.toLowerCase().includes("already")) {
          setError("כתובת האימייל כבר רשומה במערכת. נסו להתחבר.")
          setIsLoading(false)
          return
        }
        setError(signUpError.message || "שגיאת הרשמה")
        setIsLoading(false)
        return
      }

      const r = await fetch("/api/auditor/auth/bootstrap-company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          company_name: companyName.trim() || undefined,
          address: !isLtr ? address.trim() || undefined : undefined,
          website: !isLtr ? website.trim() || undefined : undefined,
          contact_name: !isLtr ? contactName.trim() || undefined : undefined,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(String(j?.error || `Failed (${r.status})`))

      const localeCtx = resolvePageLocale(pathname || basePath)
      const safeEmailDomain = String(email.trim().split("@")[1] || "").trim().toLowerCase() || null
      captureLeadCreated({
        source: "auditor_register",
        page_path: pathname || `${basePath}/register`,
        page_language: localeCtx.page_language,
        page_dir: localeCtx.page_dir,
        email_domain: safeEmailDomain,
        scan_id: scanId || null,
        user_id: null,
      })

      // captureLeadCreated above only reaches PostHog.
      trackLead({ source: "auditor_register" })

      router.replace(afterCheckout)
      router.refresh()
      return
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
              <CardTitle className={`${isLtr ? "ml-6 text-left" : "mr-6 text-right"} pt-5 text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]`}>
                {props.titleText}
              </CardTitle>
              <CardDescription className={`${isLtr ? "ml-6 text-left" : "mr-6 text-right"} text-[24px]`}>{props.descriptionText}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {error ? (
                  <div
                    className={`bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-ui text-sm font-medium ${isLtr ? "text-left" : "text-right"}`}
                    role="alert"
                  >
                    {error}{" "}
                    {String(error || "").includes("כבר רשומה") || String(error || "").toLowerCase().includes("already") ? (
                      <span className="inline-flex gap-1">
                        <Link className="auth-link underline" href={loginHref}>
                          {props.footerLoginLinkText}
                        </Link>
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="auth-field">
                  <FloatingInput
                    label={props.labelFullName ?? "שם מלא"}
                    id="full_name"
                    placeholder={isLtr ? "John Doe" : "ישראל ישראלי"}
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelAlign={isLtr ? "left" : "right"}
                    labelPlacement="above"
                    inputAlign={isLtr ? "left" : undefined}
                    helperTextAlign={isLtr ? "left" : undefined}
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label={props.labelEmail ?? "כתובת אימייל"}
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    className="auth-input"
                    labelClassName="auth-label"
                    labelAlign={isLtr ? "left" : "right"}
                    labelPlacement="above"
                    inputAlign={isLtr ? "left" : undefined}
                    helperTextAlign={isLtr ? "left" : undefined}
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label={props.labelPhone ?? "טלפון נייד"}
                    id="phone"
                    type="tel"
                    placeholder={isLtr ? "+1-555-1234567" : "050-1234567"}
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    className="auth-input"
                    labelClassName="auth-label"
                    labelAlign={isLtr ? "left" : "right"}
                    labelPlacement="above"
                    inputAlign={isLtr ? "left" : undefined}
                    helperTextAlign={isLtr ? "left" : undefined}
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label={props.labelCompanyName ?? (isLtr ? "Company name" : "שם חברה")}
                    id="company_name"
                    placeholder={isLtr ? "Acme Inc." : "חברה בע\"מ"}
                    helperText={
                      props.helperCompanyName ??
                      (isLtr
                        ? "This is the business name that will appear on your invoice after payment."
                        : "זהו שם העסק שיופיע על החשבונית לאחר התשלום.")
                    }
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelAlign={isLtr ? "left" : "right"}
                    labelPlacement="above"
                    inputAlign={isLtr ? "left" : undefined}
                    helperTextAlign={isLtr ? "left" : undefined}
                  />
                </div>
                {!isLtr ? (
                  <>
                    <div className="auth-field">
                      <FloatingInput
                        label={props.labelAddress ?? (isLtr ? "Address" : "כתובת")}
                        id="address"
                        placeholder={isLtr ? "123 Main St, City" : "רחוב 1, תל אביב"}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="auth-input"
                        labelClassName="auth-label"
                        labelAlign={isLtr ? "left" : "right"}
                        labelPlacement="above"
                        inputAlign={isLtr ? "left" : undefined}
                        helperTextAlign={isLtr ? "left" : undefined}
                      />
                    </div>
                    <div className="auth-field">
                      <FloatingInput
                        label={props.labelWebsite ?? (isLtr ? "Website" : "אתר")}
                        id="website"
                        type="url"
                        placeholder="https://example.com"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        dir="ltr"
                        className="auth-input"
                        labelClassName="auth-label"
                        labelAlign={isLtr ? "left" : "right"}
                        labelPlacement="above"
                        inputAlign={isLtr ? "left" : undefined}
                        helperTextAlign={isLtr ? "left" : undefined}
                      />
                    </div>
                    <div className="auth-field">
                      <FloatingInput
                        label={props.labelContactName ?? (isLtr ? "Contact name" : "שם איש קשר")}
                        id="contact_name"
                        placeholder={isLtr ? "John Doe" : "ישראל ישראלי"}
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="auth-input"
                        labelClassName="auth-label"
                        labelAlign={isLtr ? "left" : "right"}
                        labelPlacement="above"
                        inputAlign={isLtr ? "left" : undefined}
                        helperTextAlign={isLtr ? "left" : undefined}
                      />
                    </div>
                  </>
                ) : null}

                <div className="auth-field">
                  <FloatingInput
                    label={props.labelPassword ?? "סיסמה"}
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="auth-input"
                    labelClassName="auth-label"
                    labelAlign={isLtr ? "left" : "right"}
                    labelPlacement="above"
                    helperText={props.helperPassword ?? "מינימום 8 תווים"}
                    inputAlign={isLtr ? "left" : undefined}
                    helperTextAlign={isLtr ? "left" : undefined}
                  />
                </div>

                <div className={`flex flex-col gap-2 ${isLtr ? "text-left" : "text-right"}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="legalTerms"
                      checked={acceptedLegalTerms}
                      onCheckedChange={(v) => setAcceptedLegalTerms(v === true)}
                      className="mt-1"
                    />
                    <label htmlFor="legalTerms" className="auth-checkbox-label cursor-pointer">
                      {props.legalTermsText}
                    </label>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="marketing"
                      checked={acceptedMarketing}
                      onCheckedChange={(v) => setAcceptedMarketing(v === true)}
                      className="mt-1"
                    />
                    <label htmlFor="marketing" className="auth-checkbox-label cursor-pointer">
                      {props.marketingText}
                    </label>
                  </div>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full auth-primary-button" variant="primary">
                  {isLoading ? (
                    <>
                      <Loader2 size={19} className={`h-[19px] w-[19px] shrink-0 animate-spin ${isLtr ? "mr-2" : "ml-2"}`} />
                      {props.submitLoadingText}
                    </>
                  ) : (
                    props.submitButtonText
                  )}
                </Button>

                <div className="mt-4 text-center text-sm">
                  {props.footerQuestion}{" "}
                  <Link href={loginHref} className="auth-link">
                    {props.footerLoginLinkText}
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

