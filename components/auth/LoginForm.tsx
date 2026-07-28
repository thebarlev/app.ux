"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { FloatingInput } from "@/components/ui/floating-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoginVisualPanel } from "@/components/auth/LoginVisualPanel"

/** Where the marketing site lives — the target of the "back to site" link. */
const MARKETING_SITE_URL = "https://uxellent.com"

export function LoginForm(props: {
  afterLoginRedirectTo: string
  registerHref: string
  forgotPasswordHref?: string
  titleText?: string
  descriptionText?: string
  locale?: "he" | "en"
  /**
   * "card" (default) is the original centred card, used by the auditor login
   * pages and anything else that already renders this form. "split" is the
   * redesigned 50/50 layout for the product login (/login). The auth logic is
   * identical for both — only the surrounding layout differs.
   */
  variant?: "card" | "split"
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const locale = props.locale ?? "he"
  const isEn = locale === "en"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam === "unauthorized") {
      setError(isEn ? "Please sign in to access your account" : "נא להתחבר כדי לגשת לחשבון שלך")
    } else if (errorParam === "no_company") {
      setError(isEn ? "No business account found for this user" : "לא נמצא חשבון עסקי קשור למשתמש זה")
    }
  }, [searchParams, isEn])

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
        let errorMsg = isEn ? "Sign-in error" : "שגיאת התחברות"
        if (
          authError.message?.toLowerCase().includes("invalid login") ||
          authError.message?.toLowerCase().includes("invalid email or password")
        ) {
          errorMsg = isEn ? "Invalid email or password" : "אימייל או סיסמה שגויים"
        } else if (authError.message?.toLowerCase().includes("email not confirmed")) {
          errorMsg = isEn ? "Please verify your email" : "נא לאמת את כתובת האימייל שלך"
        } else if (authError.message) {
          errorMsg = isEn ? `Sign-in error: ${authError.message}` : `שגיאת התחברות: ${authError.message}`
        }

        setError(errorMsg)
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError(isEn ? "Sign-in failed. Try again." : "ההתחברות נכשלה. נסה שוב.")
        setIsLoading(false)
        return
      }

      // Check if user has a company (owner via auth_user_id OR member via company_members).
      // This allows team members / system admins (e.g. itzik@uxellent.com) who are members
      // but not owners to log in and access the dashboard.
      let companyId: string | null = null
      const { data: membership } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", data.user.id)
        .limit(1)
        .maybeSingle()
      if (membership?.company_id) {
        companyId = membership.company_id
      }
      if (!companyId) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("id")
          .eq("auth_user_id", data.user.id)
          .maybeSingle()
        companyId = companyData?.id ?? null
      }
      if (!companyId) {
        await supabase.auth.signOut()
        setError(isEn ? "No business account. Please sign up first." : "לא נמצא חשבון עסקי. נא להירשם תחילה.")
        setIsLoading(false)
        return
      }

      await supabase.from("companies").update({ last_login_at: new Date().toISOString() }).eq("id", companyId)

      router.push(props.afterLoginRedirectTo)
      router.refresh()
    } catch {
      setError(isEn ? "An unexpected error occurred. Try again." : "אירעה שגיאה לא צפויה. נסה שוב.")
    } finally {
      setIsLoading(false)
    }
  }

  const forgotHref = props.forgotPasswordHref || "/forgot-password"
  const titleText = (props.titleText || (isEn ? "Sign in" : "התחברות לחשבון")).trim()
  const descriptionText = (props.descriptionText || (isEn ? "Enter your credentials to continue" : "הזן את פרטי ההתחברות שלך כדי להמשיך")).trim()

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="ls-eye"
      aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
    >
      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )

  // ---- Redesigned split layout (product login) -----------------------------
  // Same state and same handleLogin as the card below; only the chrome differs.
  if (props.variant === "split") {
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
                <Image src="/brand/black.svg" alt="Uxellent" width={165} height={44} priority />
              </div>

              <h1 className="ls-fh">{titleText}</h1>
              <p className="ls-fsub">{descriptionText}</p>

              <form onSubmit={handleLogin} className="ls-form">
                <div className="auth-field">
                  <FloatingInput
                    label="אימייל"
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    className="auth-input text-left"
                    labelClassName="auth-label"
                    labelPlacement="above"
                    placeholder="name@business.co.il"
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
                  {passwordToggle}
                </div>

                <div className="ls-row">
                  <Link href={forgotHref} className="ls-forgot">
                    שכחת סיסמה?
                  </Link>
                </div>

                {error && (
                  <div id="login-error" className="ls-error" role="alert">
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={isLoading} className="ls-primary" variant="primary">
                  {isLoading ? (
                    <>
                      <Loader2 size={19} className="h-[19px] w-[19px] shrink-0 animate-spin ml-2" />
                      מתחבר...
                    </>
                  ) : (
                    "התחברות"
                  )}
                </Button>
              </form>

              <p className="ls-alt">
                אין לך עדיין חשבון?{" "}
                <Link href={props.registerHref} className="ls-alt-link">
                  הרשמה בחינם
                </Link>
              </p>
            </div>
          </section>

          <section className="ls-half ls-visual-side">
            <LoginVisualPanel />
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-scope">
      <main className="min-h-svh w-full flex items-center justify-center bg-bg px-4 py-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex justify-center">
            <Image src="/brand/black.svg" alt="Vow" width={210} height={94} priority />
          </div>

          <Card className="shadow-ui-lg auth-card">
            <CardHeader className="pb-4 mb-[15px]">
              <CardTitle className={`${isEn ? "ml-6 text-left" : "mr-6 text-right"} pt-5 text-[length:var(--auth-title-size)] font-[var(--auth-title-weight)] tracking-[var(--auth-title-tracking)]`}>
                {titleText}
              </CardTitle>
              <CardDescription className={`${isEn ? "ml-6 text-left" : "mr-6 text-right"} text-[24px]`}>{descriptionText}</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleLogin} className="auth-form">
                <div className="auth-field">
                  <FloatingInput
                    label={isEn ? "Email" : "כתובת אימייל"}
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
                    label={isEn ? "Password" : "סיסמה"}
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
                    aria-label={showPassword ? (isEn ? "Hide password" : "הסתר סיסמה") : (isEn ? "Show password" : "הצג סיסמה")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {error && (
                  <div
                    id="login-error"
                    className={`bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-ui text-sm font-medium ${isEn ? "text-left" : "text-right"}`}
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={isLoading} className="w-full auth-primary-button" variant="primary">
                  {isLoading ? (
                    <>
                      <Loader2 size={19} className={`h-[19px] w-[19px] shrink-0 animate-spin ${isEn ? "mr-2" : "ml-2"}`} />
                      {isEn ? "Signing in…" : "מתחבר..."}
                    </>
                  ) : (
                    isEn ? "Sign in" : "התחבר לחשבון"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6 pt-5">
            <p className="text-center">
              {isEn ? "Don't have an account? " : "אין לך חשבון? "}
              <Link href={props.registerHref} className="auth-link">
                {isEn ? "Sign up" : "הרשמה לחשבון חדש"}
              </Link>
            </p>

            <p className="mt-3 text-center">
              <Link href={forgotHref} tabIndex={0} className="auth-link">
                {isEn ? "Forgot password" : "שכחתי סיסמה"}
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

