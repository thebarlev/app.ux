"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"

export default function AuditorRegisterClient(props: {
  legalTermsText: string
  marketingText: string
  requireLegalTermsRequired: boolean
  requireMarketingRequired: boolean
}) {
  const router = useRouter()
  const sp = useSearchParams()

  const linkId = useMemo(() => String(sp.get("link_id") || "").trim(), [sp])
  const loginHref = linkId ? `/auditor/login?link_id=${encodeURIComponent(linkId)}` : "/auditor/login"
  const after = linkId ? `/auditor/checkout?link_id=${encodeURIComponent(linkId)}` : "/auditor/checkout"

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false)
  const [acceptedMarketing, setAcceptedMarketing] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setError(null)
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

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
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

      // Ensure company exists for this user (service-side bootstrap).
      const r = await fetch("/api/auditor/auth/bootstrap-company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim(), phone: phone.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(String(j?.error || `Failed (${r.status})`))

      // Proceed to checkout (user is signed-in after signUp in most Supabase configs).
      router.replace(after)
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
              <CardTitle className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
                הרשמה ל‑Auditor
              </CardTitle>
              <CardDescription className="mr-6 text-right">השאירו פרטים כדי להמשיך לתשלום מאובטח</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {error ? (
                  <div
                    className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-ui text-sm font-medium text-right"
                    role="alert"
                  >
                    {error}{" "}
                    {String(error || "").includes("כבר רשומה") ? (
                      <span className="inline-flex gap-1">
                        <Link className="auth-link underline" href={loginHref}>
                          התחברות
                        </Link>
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="auth-field">
                  <FloatingInput
                    label="שם מלא"
                    id="full_name"
                    placeholder="ישראל ישראלי"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="auth-input"
                    labelClassName="auth-label"
                    labelPlacement="above"
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="כתובת אימייל"
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
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
                  />
                </div>

                <div className="auth-field">
                  <FloatingInput
                    label="סיסמה"
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
                    labelClassName="auth-label"
                    labelPlacement="above"
                    helperText="מינימום 8 תווים"
                  />
                </div>

                <div className="flex flex-col gap-2 text-right">
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
                      <Loader2 size={19} className="h-[19px] w-[19px] shrink-0 animate-spin ml-2" />
                      נרשמים…
                    </>
                  ) : (
                    "המשך לתשלום"
                  )}
                </Button>

                <div className="mt-4 text-center text-sm">
                  כבר יש לך חשבון?{" "}
                  <Link href={loginHref} className="auth-link">
                    התחברות
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

