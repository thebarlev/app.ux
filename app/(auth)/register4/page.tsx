"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { isValidIsraeliId, normalizeIsraeliIdInput } from "@/lib/validation/israeli-id"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function isValidIsraeliMobile(value: string) {
  return /^0[0-9]{8,9}$/.test(value.replace(/[-\s]/g, ""))
}

const BUSINESS_TYPES = [
  { value: "osek_patur", label: "עוסק פטור" },
  { value: "osek_murshe", label: "עוסק מורשה" },
  { value: "ltd", label: "חברה בע״מ" },
  { value: "partnership", label: "שותפות" },
]

const INDUSTRIES = [
  "קמעונאות",
  "מסעדנות",
  "הייטק",
  "שירותים מקצועיים",
  "חינוך",
  "בריאות",
  "נדל״ן",
  "בנייה",
  "תחבורה",
  "ייעוץ",
  "שיווק דיגיטלי",
  "שירותי פרסום",
  "עיצוב",
  "פיתוח תוכנה",
  "חשבונאות",
  "משפטים",
  "רפואה אלטרנטיבית",
  "כושר וספורט",
  "יופי וטיפוח",
  "אירועים",
]

export default function Register4Page() {
  const router = useRouter()

  const [email, setEmail] = useState<string>("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")

  const [businessName, setBusinessName] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [companyNumber, setCompanyNumber] = useState("")
  const [industry, setIndustry] = useState("")
  const [customIndustry, setCustomIndustry] = useState("")

  const [step, setStep] = useState<1 | 2>(1)
  const [showPassword, setShowPassword] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const fullName = useMemo(() => `${firstName} ${lastName}`.trim(), [firstName, lastName])

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace("/login")
        return
      }

      setEmail(user.email ?? "")

      const meta = (user.user_metadata ?? {}) as Record<string, any>
      setFirstName((meta.first_name as string) ?? "")
      setLastName((meta.last_name as string) ?? "")
      setPhone((meta.phone as string) ?? "")

      // If user already has a company, they are already onboarded.
      const { data: existingCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle()
      if (existingCompany?.id) {
        router.replace("/dashboard")
        return
      }

      setIsBootstrapping(false)
    }

    run()
  }, [router])

  const validateStep1 = () => {
    const next: Record<string, string> = {}
    if (!firstName.trim()) next.firstName = "שדה חובה"
    if (!lastName.trim()) next.lastName = "שדה חובה"
    if (!phone.trim()) next.phone = "שדה חובה"
    else if (!isValidIsraeliMobile(phone)) next.phone = "מספר טלפון לא תקין"

    if (!password) next.password = "שדה חובה"
    else if (password.length < 8) next.password = "סיסמה חייבת להכיל לפחות 8 תווים"

    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const validateStep2 = () => {
    const next: Record<string, string> = {}
    const invalidIdMessage = "מספר תעודת זהות / ח״פ אינו תקין"

    if (!businessName.trim()) next.businessName = "שדה חובה"
    if (!businessType) next.businessType = "שדה חובה"
    if (!companyNumber.trim()) next.companyNumber = "שדה חובה"
    if (companyNumber.trim() && !isValidIsraeliId(companyNumber)) next.companyNumber = invalidIdMessage

    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const createCompanyAndMembershipStep2 = async (authUserId: string, userEmail: string) => {
    const supabase = createClient()

    const invalidIdMessage = "מספר תעודת זהות / ח״פ אינו תקין"
    if (!isValidIsraeliId(companyNumber)) {
      setFieldErrors((prev) => ({ ...prev, companyNumber: invalidIdMessage }))
      throw new Error(invalidIdMessage)
    }

    // NOTE: This is intentionally the same schema-drift tolerant approach as `step-business-profile.tsx`.
    const baseCompanyPayload: Record<string, any> = {
      company_name: businessName,
      business_type: businessType,
      registration_number: normalizeIsraeliIdInput(companyNumber) || null,
      industry: industry || null,
      custom_industry: customIndustry || null,
      contact_first_name: firstName,
      contact_full_name: `${firstName} ${lastName}`.trim(),
      email: userEmail,
      mobile_phone: phone || null,
      auth_user_id: authUserId,
      status: "active",
    }

    const removedCompanyCols: string[] = []
    let companyPayload: Record<string, any> = { ...baseCompanyPayload }
    let companyData: any = null
    let companyError: any = null

    for (let attempt = 0; attempt < 20; attempt++) {
      const r = await supabase.from("companies").insert(companyPayload).select("id").single()
      companyData = r.data
      companyError = r.error
      if (!companyError) break

      const code = (companyError as any)?.code ?? null
      const msg = typeof companyError.message === "string" ? companyError.message : ""
      if (code === "P0001" || msg.includes("INVALID_TAX_ID")) {
        setFieldErrors((prev) => ({ ...prev, companyNumber: invalidIdMessage }))
        throw new Error(invalidIdMessage)
      }
      if (code === "PGRST204") {
        const m = msg.match(/Could not find the '([^']+)' column/i)
        const missingCol = m?.[1]
        if (missingCol && Object.prototype.hasOwnProperty.call(companyPayload, missingCol)) {
          removedCompanyCols.push(missingCol)
          delete companyPayload[missingCol]
          continue
        }
      }
      break
    }

    if (companyError || !companyData?.id) {
      if ((companyError as any)?.code === "PGRST204" && typeof companyError?.message === "string") {
        throw new Error(
          `שגיאה זמנית בשרת (Schema Cache). יש להריץ בסופאבייס: select pg_notify('pgrst','reload schema'); ואז לנסות שוב.\n` +
            `(${companyError.message})`
        )
      }
      throw new Error(`שגיאה ביצירת חברה: ${companyError?.message || "Unknown error"}`)
    }

    const insertMemberWithStatus = () =>
      supabase.from("company_members").insert({ company_id: companyData.id, user_id: authUserId, role: "owner", status: "active" })

    const insertMemberNoStatus = () => supabase.from("company_members").insert({ company_id: companyData.id, user_id: authUserId, role: "owner" })

    let { error: memberError } = await insertMemberWithStatus()
    if (
      memberError &&
      (memberError as any)?.code === "PGRST204" &&
      typeof memberError.message === "string" &&
      memberError.message.includes("status")
    ) {
      ;({ error: memberError } = await insertMemberNoStatus())
    }

    if (memberError) {
      throw new Error(`שגיאה ביצירת קישור לחברה: ${memberError.message || "Unknown error"}`)
    }

    return companyData.id
  }

  const onSubmitStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep1()) return

    setError(null)
    setIsLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || !user.id || !user.email) {
        router.replace("/login")
        return
      }

      // 1) Update password + metadata (email is readonly)
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      })

      if (updateError) {
        setError(updateError.message || "שגיאה בעדכון משתמש. נסה שוב.")
        setIsLoading(false)
        return
      }

      // Step 2: business profile
      setStep(2)
    } catch (err: any) {
      setError(err?.message ? `שגיאה: ${err.message}` : "שגיאה לא צפויה")
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep2()) return

    setError(null)
    setIsLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || !user.id || !user.email) {
        router.replace("/login")
        return
      }

      await createCompanyAndMembershipStep2(user.id, user.email)

      router.replace("/dashboard")
      router.refresh()
    } catch (err: any) {
      setError(err?.message ? `שגיאה: ${err.message}` : "שגיאה לא צפויה")
    } finally {
      setIsLoading(false)
    }
  }

  if (isBootstrapping) {
    return (
      <div className="auth-scope">
        <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="טוען" />
        </main>
      </div>
    )
  }

  return (
    <div className="auth-scope">
      <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-[70px] -mt-[80px] flex justify-center">
            <Image src="/brand/vow.svg" alt="Vow" width={210} height={94} priority />
          </div>

          <Card className="shadow-ui-lg auth-card">
            <CardHeader className="pb-4 mb-[15px]">
              <CardTitle className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
                {step === 1 ? "פרטים אישיים" : "פרופיל עסקי"}
              </CardTitle>
              <CardDescription className="mr-6 text-right">
                {step === 1 && email ? (
                  <>
                    החשבון שלך:{" "}
                    <span className="font-medium" dir="ltr">
                      {email}
                    </span>
                  </>
                ) : (
                  step === 1 ? "השלם/י את הפרטים כדי להמשיך" : "ספר לנו על העסק שלך"
                )}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {step === 1 ? (
                <form onSubmit={onSubmitStep1} className="auth-form" noValidate>
                  {error && (
                    <div
                      className="p-4 rounded-[5px]"
                      role="alert"
                      aria-live="assertive"
                      style={{ backgroundColor: "rgba(155, 0, 3, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)" }}
                    >
                      {error}
                    </div>
                  )}

                  <div className="auth-field">
                    <FloatingInput
                      label="שם פרטי"
                      id="firstName"
                      placeholder="ישראל"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      error={fieldErrors.firstName}
                      containerClassName="w-full min-w-0"
                      className="auth-input"
                      labelClassName="auth-label"
                      labelPlacement="above"
                    />
                  </div>

                  <div className="auth-field">
                    <FloatingInput
                      label="שם משפחה"
                      id="lastName"
                      placeholder="ישראלי"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      error={fieldErrors.lastName}
                      containerClassName="w-full min-w-0"
                      className="auth-input"
                      labelClassName="auth-label"
                      labelPlacement="above"
                    />
                  </div>

                  <div className="auth-field">
                    <FloatingInput
                      label="טלפון נייד"
                      id="phone"
                      type="tel"
                      placeholder="050-1234567"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      dir="ltr"
                      className="auth-input text-left"
                      labelClassName="auth-label"
                      labelPlacement="above"
                      error={fieldErrors.phone}
                      containerClassName="w-full min-w-0"
                    />
                  </div>

                  <div className="auth-field relative">
                    <FloatingInput
                      label="סיסמה"
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      dir="ltr"
                      className="auth-input text-left pr-12"
                      labelClassName="auth-label"
                      labelPlacement="above"
                      helperText="מינימום 8 תווים"
                      error={fieldErrors.password}
                      containerClassName="w-full min-w-0"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-4 top-[calc(50%+12px)] -translate-y-1/2 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-ui p-1"
                      aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <Button type="submit" disabled={isLoading} className="w-full auth-primary-button" variant="primary">
                    {isLoading ? (
                      <>
                        <Loader2 size={19} className="h-[19px] w-[19px] shrink-0 animate-spin ml-2" />
                        שומרים...
                      </>
                    ) : (
                      "המשך"
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={onSubmitStep2} className="auth-form" noValidate>
                  {error && (
                    <div
                      className="p-4 rounded-[5px]"
                      role="alert"
                      aria-live="assertive"
                      style={{ backgroundColor: "rgba(155, 0, 3, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)" }}
                    >
                      {error}
                    </div>
                  )}

                  <div className="auth-field">
                    <FloatingInput
                      label="שם העסק"
                      id="businessName"
                      placeholder="שם העסק"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      error={fieldErrors.businessName}
                      containerClassName="w-full min-w-0"
                      className="auth-input"
                      labelClassName="auth-label"
                      labelPlacement="above"
                    />
                  </div>

                  <div className="auth-field">
                    <Label htmlFor="businessType" className="auth-label text-right">
                      סוג העסק <span style={{ color: "var(--danger)" }} aria-label="שדה חובה">*</span>
                    </Label>
                    <Select value={businessType} onValueChange={(value) => setBusinessType(value)}>
                      <SelectTrigger
                        id="businessType"
                        variant="underline"
                        className={fieldErrors.businessType ? "auth-input border-danger focus:border-danger" : "auth-input"}
                      >
                        <SelectValue placeholder="בחר סוג עסק" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUSINESS_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.businessType && (
                      <p className="text-sm mt-1" style={{ color: "var(--danger)" }} role="alert">
                        {fieldErrors.businessType}
                      </p>
                    )}
                  </div>

                  <div className="auth-field">
                    <FloatingInput
                      label="מספר חברה / תעודת זהות"
                      id="companyNumber"
                      placeholder="123456789"
                      required
                      value={companyNumber}
                      onChange={(e) => {
                        setCompanyNumber(e.target.value)
                        if (fieldErrors.companyNumber) setFieldErrors((prev) => ({ ...prev, companyNumber: "" }))
                      }}
                      onBlur={() => {
                        const v = companyNumber
                        if (!v.trim()) return
                        if (!isValidIsraeliId(v)) setFieldErrors((prev) => ({ ...prev, companyNumber: "מספר תעודת זהות / ח״פ אינו תקין" }))
                        else if (fieldErrors.companyNumber) setFieldErrors((prev) => ({ ...prev, companyNumber: "" }))
                      }}
                      dir="ltr"
                      className="auth-input text-left"
                      labelClassName="auth-label"
                      labelPlacement="above"
                      error={fieldErrors.companyNumber}
                      containerClassName="w-full min-w-0"
                    />
                  </div>

                  <div className="auth-field">
                    <Label htmlFor="industry" className="auth-label text-right">
                      תחום פעילות
                    </Label>
                    <Select
                      value={industry ? industry : undefined}
                      onValueChange={(value) => {
                        setIndustry(value)
                        setCustomIndustry("")
                      }}
                    >
                      <SelectTrigger id="industry" variant="underline" className="auth-input">
                        <SelectValue placeholder="בחר תחום פעילות (אופציונלי)" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((label) => (
                          <SelectItem key={label} value={label}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs" style={{ color: "var(--muted-fg)" }}>
                      אופציונלי — ניתן להמשיך גם ללא בחירה
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={() => setStep(1)}
                      variant="secondary"
                      className="flex-1"
                      disabled={isLoading}
                    >
                      חזור
                    </Button>
                    <Button type="submit" variant="primary" className="flex-1 auth-primary-button" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 size={19} className="h-[19px] w-[19px] shrink-0 animate-spin ml-2" />
                          שומרים...
                        </>
                      ) : (
                        "סיום והרשמה"
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

