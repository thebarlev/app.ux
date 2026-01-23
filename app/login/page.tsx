"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import Link from "next/link"
import { RegistrationLogo } from "@/components/registration/registration-logo"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam === "unauthorized") {
      setError("נא להתחבר כדי לגשת לחשבון שלך")
    } else if (errorParam === "no_company") {
      setError("לא נמצא חשבון עסקי קשור למשתמש זה")
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (authError) {
        console.error("🔴 Auth login error:", {
          message: authError.message || "Unknown error",
          name: authError.name || "Unknown",
          status: authError.status || "Unknown",
        })
        
        // User-friendly error messages
        let errorMsg = "שגיאת התחברות"
        if (authError.message?.toLowerCase().includes("invalid login") || 
            authError.message?.toLowerCase().includes("invalid email or password")) {
          errorMsg = "אימייל או סיסמה שגויים"
        } else if (authError.message?.toLowerCase().includes("email not confirmed")) {
          errorMsg = "נא לאמת את כתובת האימייל שלך"
        } else if (authError.message) {
          errorMsg = `שגיאת התחברות: ${authError.message}`
        }
        
        setError(errorMsg)
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError("ההתחברות נכשלה. נסה שוב.")
        setIsLoading(false)
        return
      }

      // Check if user has a company (business owner)
      const { data: companyData } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("auth_user_id", data.user.id)
        .single()

      if (!companyData) {
        await supabase.auth.signOut()
        setError("לא נמצא חשבון עסקי. נא להירשם תחילה.")
        setIsLoading(false)
        return
      }

      // Update last login
      await supabase.from("companies").update({ last_login_at: new Date().toISOString() }).eq("id", companyData.id)

      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      setError("אירעה שגיאה לא צפויה. נסה שוב.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8" dir="rtl">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <RegistrationLogo titleSize="small" />
        </div>

        {/* Login Card */}
        <Card className="shadow-ui-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-right">
              התחברות לחשבון
            </CardTitle>
            <CardDescription className="text-muted-fg text-right">
              הזן את פרטי ההתחברות שלך כדי להמשיך
            </CardDescription>
          </CardHeader>

          <CardContent>
          <form onSubmit={handleLogin} className="space-y-5">
              <FloatingInput
                label="כתובת אימייל"
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                className="text-left"
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
              />

              {/* Password Field */}
              <div className="relative">
                <FloatingInput
                  label="סיסמה"
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  className="text-left pr-12"
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-ui p-1"
                  aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Forgot Password Link - below password input, above submit, RTL right-aligned */}
              <div className="flex justify-end mt-0 mb-1" dir="rtl">
                <Link
                  href="/forgot-password"
                  className="text-[16px] text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-ui font-normal"
                  tabIndex={0}
                >
                  שכחתי סיסמה
                </Link>
              </div>

              {/* Error Message */}
              {error && (
                <div 
                  id="login-error"
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
                    מתחבר...
                  </>
                ) : (
                  "התחבר לחשבון"
                )}
              </Button>
          </form>
          </CardContent>
        </Card>

        {/* Sign Up Link */}
        <p className="mt-6 text-center">
          אין לך חשבון?{" "}
          <Link 
            href="/register" 
            className="text-primary hover:text-primary-hover font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-ui"
          >
            הרשמה לחשבון חדש
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
