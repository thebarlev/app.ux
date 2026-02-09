"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useRegistration } from "./registration-context"
import { createClient } from "@/lib/supabase/client"
import { PUBLIC_ASSETS_BUCKET, SECURE_ASSETS_BUCKET } from "@/lib/storage/buckets"
import { isValidIsraeliId, normalizeIsraeliIdInput } from "@/lib/validation/israeli-id"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FloatingInput } from "@/components/ui/floating-input"
import { Label } from "@/components/ui/label"

interface StepOnboardingProps {
  legalTermsText: string
  marketingText: string
}

export function StepOnboarding(_props: StepOnboardingProps) {
  const router = useRouter()
  const { data, updateData, prevStep, isLoading, setIsLoading, error, setError } = useRegistration()

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null)

  const logoInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)

  const allowedImageTypes = useMemo(() => new Set(["image/png", "image/jpeg", "image/jpg", "image/svg+xml"]), [])
  const maxImageBytes = 5 * 1024 * 1024
  const invalidIdMessage = "מספר תעודת זהות / ח״פ אינו תקין"

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
      if (signaturePreviewUrl) URL.revokeObjectURL(signaturePreviewUrl)
    }
  }, [logoPreviewUrl, signaturePreviewUrl])

  const handlePickLogo = (file: File | null) => {
    setLogoFile(file)
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const handlePickSignature = (file: File | null) => {
    setSignatureFile(file)
    if (signaturePreviewUrl) URL.revokeObjectURL(signaturePreviewUrl)
    setSignaturePreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const uploadOne = async (supabase: ReturnType<typeof createClient>, companyId: string, file: File, kind: "logo" | "signature") => {
    if (!allowedImageTypes.has(file.type)) {
      throw new Error("סוג קובץ לא נתמך")
    }
    if (file.size > maxImageBytes) {
      throw new Error("הקובץ גדול מדי (מעל 5MB)")
    }

    const fileExt = file.name.split(".").pop() ?? "png"
    const fileName = kind === "logo" ? `logo.${fileExt}` : `signature.${fileExt}`
    const folder = kind === "logo" ? "business-logos" : "business-signatures"
    const filePath = `${folder}/${companyId}/${fileName}`

    const bucket = kind === "logo" ? PUBLIC_ASSETS_BUCKET : SECURE_ASSETS_BUCKET
    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true })
    if (uploadError) throw new Error(uploadError.message)

    // Logos can remain public; signatures must never be public.
    const publicUrl =
      kind === "logo"
        ? supabase.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(filePath).data.publicUrl
        : null

    const updateField = kind === "logo" ? { logo_url: publicUrl } : { signature_url: filePath }
    const { error: updateError } = await supabase.from("companies").update(updateField).eq("id", companyId)
    if (updateError) throw new Error(updateError.message)
  }

  const submitRegistration = async (source: "confirm" | "skip") => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Validate BEFORE auth.signUp() to prevent orphan users on invalid ID.
      if (!isValidIsraeliId(data.companyNumber)) {
        setError(invalidIdMessage)
        setIsLoading(false)
        return
      }

      let authUserId: string | null = null
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/app`,
          data: { first_name: data.firstName, last_name: data.lastName },
        },
      })

      if (signUpError) {
        const code = (signUpError as any)?.code ?? null

        // If the user was already created (common when Step 3 was retried after a DB failure),
        // try to sign-in and continue to company creation instead of blocking.
        if (code === "user_already_exists" || signUpError.message?.toLowerCase().includes("already")) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
          })

          if (signInError || !signInData?.user?.id) {
            setError("כתובת האימייל כבר רשומה במערכת. נסה להתחבר.")
            setIsLoading(false)
            return
          }

          authUserId = signInData.user.id
        } else {
          const errorMsg = signUpError.message?.includes("already registered")
            ? "כתובת האימייל כבר רשומה במערכת. נסה להתחבר."
            : `שגיאת הרשמה: ${signUpError.message || "Unknown error"}`
          setError(errorMsg)
          setIsLoading(false)
          return
        }
      } else {
        authUserId = signUpData?.user?.id ?? null
      }

      if (!authUserId) {
        setError("ההרשמה נכשלה. נסה שוב.")
        setIsLoading(false)
        return
      }

      const businessNameEnTrimmed = data.businessNameEn.trim()
      const englishAddressTrimmed = data.englishAddress.trim()

      // Build payload once, then if PostgREST schema cache rejects a specific column (PGRST204),
      // retry by removing ONLY that missing column (so we don't accidentally drop english fields).
      const baseCompanyPayload: Record<string, any> = {
        company_name: data.businessName,
        company_name_en: businessNameEnTrimmed.length > 0 ? businessNameEnTrimmed : null,
        english_address: englishAddressTrimmed.length > 0 ? englishAddressTrimmed : null,
        business_type: data.businessType,
        // Canonical identifier in this scope:
        registration_number: normalizeIsraeliIdInput(data.companyNumber) || null,
        industry: data.industry || null,
        custom_industry: data.customIndustry || null,
        contact_first_name: data.firstName,
        contact_full_name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        mobile_phone: data.phone || null,
        auth_user_id: authUserId,
        status: "active",
        accepted_legal_terms: data.acceptedLegalTerms,
        accepted_legal_terms_at: data.acceptedLegalTerms ? new Date().toISOString() : null,
        accepted_marketing: data.acceptedMarketing,
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
          setError(invalidIdMessage)
          setIsLoading(false)
          return
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
        // Provide a clearer message for schema-cache failures (actionable).
        if ((companyError as any)?.code === "PGRST204" && typeof companyError?.message === "string") {
          setError(
            `שגיאה זמנית בשרת (Schema Cache). יש להריץ בסופאבייס: select pg_notify('pgrst','reload schema'); ואז לנסות שוב.\n` +
              `(${companyError.message})`
          )
        } else {
          setError(`שגיאה ביצירת חברה: ${companyError?.message || "Unknown error"}`)
        }
        setIsLoading(false)
        return
      }

      const insertMemberWithStatus = () =>
        supabase.from("company_members").insert({ company_id: companyData.id, user_id: authUserId, role: "owner", status: "active" })

      const insertMemberNoStatus = () =>
        supabase.from("company_members").insert({ company_id: companyData.id, user_id: authUserId, role: "owner" })

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
        setError(`שגיאה ביצירת קישור לחברה: ${memberError.message || "Unknown error"}`)
        setIsLoading(false)
        return
      }

      if (logoFile) await uploadOne(supabase, companyData.id, logoFile, "logo")
      if (signatureFile) await uploadOne(supabase, companyData.id, signatureFile, "signature")

      router.push("/register/success")
      setIsLoading(false)
      return

    } catch (e: any) {
      setError(e?.message || "אירעה שגיאה לא צפויה. נסה שוב.")
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitRegistration("confirm")
  }

  return (
    <Card className="p-8">
      <CardContent className="p-0">
        <div className="mb-8">
          <h2 className="text-right mb-2">פרטי אנגלית ולוגו/חתימה</h2>
          <p className="text-right" style={{ color: "var(--muted-fg)", fontSize: "16px" }}>
            אופציונלי — ניתן לדלג ולהשלים אחר כך ב־/dashboard/settings
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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

          <FloatingInput
            label="שם עסק באנגלית (אופציונלי)"
            id="businessNameEn"
            value={data.businessNameEn}
            onChange={(e) => updateData({ businessNameEn: e.target.value })}
            dir="ltr"
            className="text-left"
            containerClassName="w-full min-w-0"
          />

          <FloatingInput
            label="כתובת באנגלית (אופציונלי)"
            id="englishAddress"
            value={data.englishAddress}
            onChange={(e) => updateData({ englishAddress: e.target.value })}
            dir="ltr"
            className="text-left"
            containerClassName="w-full min-w-0"
          />

          <div className="space-y-2">
            <Label className="text-right">לוגו (אופציונלי)</Label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              className="hidden"
              onChange={(e) => handlePickLogo(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => logoInputRef.current?.click()}>
                העלה לוגו
              </Button>
              {logoFile && (
                <span className="text-sm" style={{ color: "var(--muted-fg)" }}>
                  {logoFile.name}
                </span>
              )}
            </div>
            {logoPreviewUrl && (
              <div className="mt-2">
                <img src={logoPreviewUrl} alt="תצוגה מקדימה לוגו" className="max-h-20 rounded-[5px]" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-right">חתימה (אופציונלי)</Label>
            <input
              ref={signatureInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              className="hidden"
              onChange={(e) => handlePickSignature(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => signatureInputRef.current?.click()}>
                העלה חתימה
              </Button>
              {signatureFile && (
                <span className="text-sm" style={{ color: "var(--muted-fg)" }}>
                  {signatureFile.name}
                </span>
              )}
            </div>
            {signaturePreviewUrl && (
              <div className="mt-2">
                <img src={signaturePreviewUrl} alt="תצוגה מקדימה חתימה" className="max-h-20 rounded-[5px]" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Button type="button" onClick={prevStep} variant="secondary" className="flex-1" disabled={isLoading}>
                חזור
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={isLoading} loading={isLoading}>
                סיום הרשמה
              </Button>
            </div>
            <Button type="button" variant="ghost" className="w-full" disabled={isLoading} onClick={() => submitRegistration("skip")}>
              דלג לעת עתה
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
