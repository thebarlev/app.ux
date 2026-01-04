"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { NeumorphicCard } from "@/components/registration/neumorphic-card"
import { NeumorphicInput } from "@/components/registration/neumorphic-input"
import { NeumorphicButton } from "@/components/registration/neumorphic-button"
import { RegistrationLogo } from "@/components/registration/registration-logo"

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
    <div className="min-h-svh w-full flex items-center justify-center bg-ui-bg" dir="rtl">
      <div className="w-full max-w-[460px] px-4 py-8">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <RegistrationLogo />
        </div>

        <div className="ui-card">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-ui-text mb-2">התחברות לחשבון</h1>
            <p className="ui-text-muted">הזן את פרטי ההתחברות שלך כדי להמשיך</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="ui-label">
                כתובת אימייל
              </label>
              <input
                id="email"
                type="email"
                className="ui-input text-left"
                placeholder="israel@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </div>

            <div>
              <label htmlFor="password" className="ui-label">
                סיסמה
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="ui-input text-left pl-12"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-ui-text-muted hover:text-ui-text transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="ui-alert-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="ui-button-primary w-full"
            >
              {isLoading ? "מתחבר..." : "התחבר לחשבון"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center ui-text-muted">
          אין לך חשבון?{" "}
          <Link href="/register" className="text-ui-primary hover:text-ui-primary-hover font-semibold transition-colors">
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
