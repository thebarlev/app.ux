"use client"

import type React from "react"
import { useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Loader2, ArrowRight } from "lucide-react"
import Link from "next/link"
import { RegistrationLogo } from "@/components/registration/registration-logo"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

function ForgotPasswordForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClient()

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        console.error("🔴 Password reset error:", resetError)
        let errorMsg = "שגיאה בשליחת קישור איפוס סיסמה"
        if (resetError.message?.toLowerCase().includes("email not found")) {
          errorMsg = "כתובת האימייל לא נמצאה במערכת"
        } else if (resetError.message) {
          errorMsg = `שגיאה: ${resetError.message}`
        }
        setError(errorMsg)
        setIsLoading(false)
        return
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
      <div className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8" dir="rtl">
        <div className="w-full max-w-[420px]">
          {/* Logo */}
          <div className="mb-10 flex justify-center">
            <RegistrationLogo />
          </div>

          {/* Success Card */}
          <Card className="shadow-ui-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-right">
                קישור איפוס נשלח
              </CardTitle>
              <CardDescription className="text-muted-fg text-right">
                בדוק את תיבת הדואר הנכנס שלך
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-ui text-sm font-medium text-right" role="alert">
                קישור לאיפוס הסיסמה נשלח לכתובת {email}. נא לבדוק את תיבת הדואר הנכנס ולפעול לפי ההוראות.
              </div>

              <div className="pt-4">
                <Link href="/login">
                  <Button variant="primary" className="w-full" type="button">
                    חזרה להתחברות
                    <ArrowRight className="h-4 w-4 mr-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8" dir="rtl">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <RegistrationLogo />
        </div>

        {/* Forgot Password Card */}
        <Card className="shadow-ui-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-right">
              שכחתי סיסמה
            </CardTitle>
            <CardDescription className="text-muted-fg text-right">
              הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס הסיסמה
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-right">
                  כתובת אימייל
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="israel@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="text-left"
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? "email-error" : undefined}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div 
                  id="email-error"
                  className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-ui text-sm font-medium text-right" 
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full"
                variant="primary"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    שולח...
                  </>
                ) : (
                  "שלח קישור איפוס"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Back to Login Link */}
        <p className="mt-6 text-center">
          זכרת את הסיסמה?{" "}
          <Link 
            href="/login" 
            className="text-primary hover:text-primary-hover font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-ui"
          >
            חזרה להתחברות
          </Link>
        </p>
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
