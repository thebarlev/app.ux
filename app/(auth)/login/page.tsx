"use client"

import type React from "react"
import { Suspense, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
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
        if (
          authError.message?.toLowerCase().includes("invalid login") ||
          authError.message?.toLowerCase().includes("invalid email or password")
        ) {
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
    <div className="auth-scope">
      <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-[70px] -mt-[80px] flex justify-center">
            <Image src="/brand/vow.svg" alt="Vow" width={210} height={94} priority />
          </div>

          <Card className="shadow-ui-lg auth-card">
            <CardHeader className="pb-4 mb-[15px]">
              <CardTitle className="mr-6 pt-5 text-right text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]">התחברות לחשבון</CardTitle>
              <CardDescription className="mr-6  text-right">הזן את פרטי ההתחברות שלך כדי להמשיך</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleLogin} className="auth-form">
                <div className="auth-field">
                  <FloatingInput
                    label="כתובת אימייל"
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
                    labelClassName="auth-label"
                    labelPlacement="above"
                    placeholder="name@example.com"
                    aria-required="true"
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                  />
                </div>

                <div className="auth-field relative">
                  <FloatingInput
                    label="סיסמה"
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left pr-12"
                    labelClassName="auth-label"
                    labelPlacement="above"
                    placeholder="••••••••"
                    aria-required="true"
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
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

                {error && (
                  <div
                    id="login-error"
                    className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-ui text-sm font-medium text-right"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={isLoading} className="w-full auth-primary-button" variant="primary">
                  {isLoading ? (
                    <>
                      <Loader2 size={19}  className="h-[19px] w-[19px] shrink-0 animate-spin ml-2" />
                      מתחבר...
                    </>
                  ) : (
                    "התחבר לחשבון"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6 pt-5">
            <p className="text-center">
              אין לך חשבון?{" "}
              <Link href="/register" className="auth-link">
                הרשמה לחשבון חדש
              </Link>
            </p>

            <p className="mt-3 text-center">
              <Link href="/forgot-password" tabIndex={0} className="auth-link">
                שכחתי סיסמה
              </Link>
            </p>
          </div>
        </div>
      </main>
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

