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
        setError("אימייל או סיסמה שגויים")
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
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <RegistrationLogo />
        </div>

        <NeumorphicCard>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">התחברות</h2>
            <p className="mt-1 text-sm text-muted-foreground">הזן את פרטי ההתחברות שלך</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <NeumorphicInput
              id="email"
              type="email"
              label="אימייל"
              placeholder="israel@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="text-left"
            />

            <div className="relative">
              <NeumorphicInput
                id="password"
                type={showPassword ? "text" : "password"}
                label="סיסמה"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="text-left pl-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-[38px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error}</p>}

            <NeumorphicButton type="submit" isLoading={isLoading} className="mt-2">
              התחבר
            </NeumorphicButton>
          </form>
        </NeumorphicCard>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          אין לך חשבון?{" "}
          <Link href="/register" className="font-medium text-primary hover:text-primary/80 transition-colors">
            הרשמה
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
