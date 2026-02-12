"use client"

import type React from "react"
import { useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, ArrowRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError("נא להזין כתובת אימייל")
      setIsLoading(false)
      return
    }
    if (!isValidEmail(normalizedEmail)) {
      setError("כתובת אימייל לא תקינה")
      setIsLoading(false)
      return
    }

    try {
      const supabase = createClient()

      // Supabase Auth Redirect URLs must include:
      // http://localhost:3000/auth/callback
      // https://app.vow.co.il/auth/callback
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })

      if (resetError) {
        // Keep response generic to avoid leaking account existence.
        console.warn("Password reset request returned an auth error", resetError.message)
      }

      setSuccess(true)
      setIsLoading(false)
    } catch (err) {
      setError("אירעה שגיאה לא צפויה. נסה שוב.")
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-scope">
        <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8" dir="rtl">
          <div className="w-full max-w-[420px]">
            <div className="mb-[70px] -mt-[80px] flex justify-center">
              <Image src="/brand/vow.svg" alt="Vow" width={210} height={94} priority />
            </div>

            <Card className="shadow-ui-lg auth-card">
              <CardHeader className="pb-4 mb-[15px]">
                <CardTitle className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
                  קישור איפוס נשלח
                </CardTitle>
                <CardDescription className="mr-6 text-right">בדוק את תיבת הדואר הנכנס שלך</CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <div
                  className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-ui text-sm font-medium text-right"
                  role="alert"
                >
                  אם כתובת האימייל קיימת במערכת, נשלח אליך קישור לאיפוס סיסמה. נא לבדוק את תיבת הדואר הנכנס.
                </div>

                <div className="pt-4">
                  <Link href="/login">
                    <Button variant="primary" className="w-full auth-primary-button" type="button">
                      חזרה להתחברות
                      <ArrowRight className="h-4 w-4 mr-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="auth-scope">
      <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8" dir="rtl">
        <div className="w-full max-w-[420px]">
          <div className="mb-[70px] -mt-[80px] flex justify-center">
            <Image src="/brand/vow.svg" alt="Vow" width={210} height={94} priority />
          </div>

          <Card className="shadow-ui-lg auth-card">
            <CardHeader className="pb-4 mb-[15px]">
              <CardTitle className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
                שכחתי סיסמה
              </CardTitle>
              <CardDescription className="mr-6 text-right">הזן אימייל לאיפוס סיסמה</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label htmlFor="email" className="auth-label">
                    כתובת אימייל
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
                    aria-required="true"
                    aria-invalid={!!error}
                    aria-describedby={error ? "email-error" : undefined}
                  />
                </div>

                {error && (
                  <div
                    id="email-error"
                    className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-ui text-sm font-medium text-right"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={isLoading} className="w-full auth-primary-button" variant="primary">
                  {isLoading ? (
                    <>
                      <Loader2 size={19} className="shrink-0 animate-spin ml-2" />
                      שולח...
                    </>
                  ) : (
                    "שלח קישור איפוס"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center">
            זכרת את הסיסמה?{" "}
            <Link href="/login" className="auth-link">
              חזרה להתחברות
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  )
}

