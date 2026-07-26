"use client"

import type React from "react"
import { useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LoginVisualPanel } from "@/components/auth/LoginVisualPanel"

/** Same marketing site as the login "back to site" link. */
const MARKETING_SITE_URL = "https://uxellent.com"

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Logic below is unchanged from the original page — only the layout differs.
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
      // https://app.uxellent.com/auth/callback
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

  return (
    <div className="auth-scope login-split" dir="rtl">
      <a className="ls-back" href={MARKETING_SITE_URL}>
        <span className="ls-back-a" aria-hidden="true">
          →
        </span>
        חזרה לאתר
      </a>

      <div className="ls-split">
        <section className="ls-half ls-form-side">
          <div className="ls-form-col">
            <div className="ls-logo">
              <Image src="/brand/uxellent.svg" alt="Uxellent" width={165} height={44} priority />
            </div>

            {success ? (
              <>
                <h1 className="ls-fh">קישור איפוס נשלח</h1>
                <p className="ls-fsub">בדקו את תיבת הדואר הנכנס שלכם</p>
                <div className="ls-success" role="alert">
                  אם כתובת האימייל קיימת במערכת, נשלח אליה קישור לבחירת סיסמה חדשה. כדאי לבדוק גם
                  את תיקיית הספאם.
                </div>
                <p className="ls-alt" style={{ marginTop: 22 }}>
                  <Link href="/login" className="ls-alt-link">
                    חזרה להתחברות
                  </Link>
                </p>
              </>
            ) : (
              <>
                <h1 className="ls-fh">איפוס סיסמה</h1>
                <p className="ls-fsub">הזינו את האימייל ונשלח לכם קישור לבחירת סיסמה חדשה</p>

                <form onSubmit={handleSubmit} className="ls-form">
                  <div className="auth-field">
                    <label htmlFor="email" className="auth-label">
                      אימייל
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@business.co.il"
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
                    <div id="email-error" className="ls-error" role="alert">
                      {error}
                    </div>
                  )}

                  <Button type="submit" disabled={isLoading} className="ls-primary" variant="primary">
                    {isLoading ? (
                      <>
                        <Loader2 size={19} className="h-[19px] w-[19px] shrink-0 animate-spin ml-2" />
                        שולח...
                      </>
                    ) : (
                      "שליחת קישור לאיפוס"
                    )}
                  </Button>
                </form>

                <p className="ls-alt">
                  נזכרתם בסיסמה?{" "}
                  <Link href="/login" className="ls-alt-link">
                    חזרה להתחברות
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>

        <section className="ls-half ls-visual-side">
          <LoginVisualPanel />
        </section>
      </div>
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
