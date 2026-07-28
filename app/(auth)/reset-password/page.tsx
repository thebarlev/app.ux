"use client"

import type React from "react"
import { Suspense, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

function ResetPasswordForm() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function verifyRecoverySession() {
      try {
        const supabase = createClient()
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (!isMounted) return

        if (sessionError || !data.session) {
          router.replace("/login?e=no_session")
          return
        }

        setIsCheckingSession(false)
      } catch {
        if (!isMounted) return
        router.replace("/login?e=no_session")
      }
    }

    verifyRecoverySession()

    return () => {
      isMounted = false
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("האימות לא תואם לסיסמה החדשה")
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setError(updateError.message || "עדכון הסיסמה נכשל. נסה שוב.")
        setIsLoading(false)
        return
      }

      toast.success("הסיסמה עודכנה בהצלחה")
      await supabase.auth.signOut()
      router.replace("/login?reset=1")
    } catch {
      setError("אירעה שגיאה לא צפויה. נסה שוב.")
      setIsLoading(false)
    }
  }

  if (isCheckingSession) {
    return (
      <div className="auth-scope">
        <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8" dir="rtl">
          <div className="w-full max-w-[420px]">
            <div className="mb-[70px] -mt-[80px] flex justify-center">
              <Image src="/brand/black.svg" alt="Vow" width={210} height={94} priority />
            </div>
            <Card className="shadow-ui-lg auth-card">
              <CardContent className="py-10">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  בודק הרשאה לאיפוס סיסמה...
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
            <Image src="/brand/black.svg" alt="Vow" width={210} height={94} priority />
          </div>

          <Card className="shadow-ui-lg auth-card">
            <CardHeader className="pb-4 mb-[15px]">
              <CardTitle className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">
                איפוס סיסמה
              </CardTitle>
              <CardDescription className="mr-6 text-right">הזן סיסמה חדשה ואשר אותה</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label htmlFor="newPassword" className="auth-label">
                    סיסמה חדשה
                  </label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="••••••••"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
                    aria-required="true"
                    aria-invalid={!!error}
                    aria-describedby={error ? "reset-password-error" : undefined}
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="confirmPassword" className="auth-label">
                    אימות סיסמה חדשה
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
                    aria-required="true"
                    aria-invalid={!!error}
                    aria-describedby={error ? "reset-password-error" : undefined}
                  />
                </div>

                {error && (
                  <div
                    id="reset-password-error"
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
                      מעדכן...
                    </>
                  ) : (
                    "שמור סיסמה חדשה"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center">
            <Link href="/login" className="auth-link">
              חזרה להתחברות
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
