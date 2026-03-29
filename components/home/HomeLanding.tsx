"use client"
import Link from "next/link"
import type React from "react"
import { useState } from "react"
import Image from "next/image"

import { createClient } from "@/lib/supabase/client"
import { EmailSentModal } from "@/components/auth/EmailSentModal"

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getSiteUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL
  const fromEnv = envUrl && envUrl.trim().length > 0 ? envUrl.trim() : null
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  if (typeof window === "undefined") return ""
  return window.location.origin.replace(/\/$/, "")
}

export function HomeLanding() {
  const [email, setEmail] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
  
    const normalizedEmail = email.trim().toLowerCase()
  
    if (!normalizedEmail) {
      setError("נא להזין כתובת אימייל")
      return
    }
  
    if (!isValidEmail(normalizedEmail)) {
      setError("כתובת אימייל לא תקינה")
      return
    }
  
    setError(null)
    setLoading(true)
  
    try {
      const supabase = createClient()
  
      const siteUrl = getSiteUrl()
      const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent("/register")}`
  
      // 🔎 DEBUG — חשוב
      console.log("========== MAGIC LINK DEBUG ==========")
      console.log("window.location.origin:", typeof window !== "undefined" ? window.location.origin : "no-window")
      console.log("NEXT_PUBLIC_SITE_URL:", process.env.NEXT_PUBLIC_SITE_URL)
      console.log("siteUrl used:", siteUrl)
      console.log("emailRedirectTo:", emailRedirectTo)
      console.log("======================================")
  
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo,
        },
      })
  
      if (otpError) {
        console.error("OTP ERROR:", otpError)
        setError(otpError.message || "שגיאה בשליחת המייל. נסה שוב.")
        setLoading(false)
        return
      }
  
      setSentTo(normalizedEmail)
      setModalOpen(true)
    } catch (err) {
      console.error("UNEXPECTED ERROR:", err)
      setError("שגיאה לא צפויה. נסה שוב.")
    } finally {
      setLoading(false)
    }
  }
    

  return (
    <main className="min-h-svh bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-10 flex justify-center">
        <Link href="https://uxellent.com">
    <Image src="/brand/vow_black.svg" alt="VOW" width={140} height={56} priority />
  </Link>
        </div>

        {/* Card layout controlled as LTR so image stays on the left */}
        <div
          dir="ltr"
          className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] bg-card shadow-[0_18px_60px_rgba(0,0,0,0.14)] md:grid-cols-2"
        >
          {/* Left image */}
          <div className="relative min-h-[260px] md:min-h-[520px]">
            <Image
              src="/brand/login.webp"
              alt=""
              fill
              priority
              className="object-cover"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>

          {/* Right form */}
          <div dir="rtl" className="flex flex-col justify-center px-6 py-8 md:px-10 md:py-10">
            <h1 className="text-right text-[40px] leading-[1.15] font-semibold text-fg">חותמים על הצלחה</h1>

            <p className="mt-3 text-right text-[18px] text-muted-foreground">
              השאירו אימייל ונשלח לכם קישור התחברות מאובטח.
            </p>

            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
              
              <div>
                <label htmlFor="home-email" className="block text-right text-[18px] font-medium">
                  כתובת אימייל
                </label>
                <input
                  id="home-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-[56px] w-full rounded-[14px] border border-black/10 bg-white px-4 text-left text-[18px] outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/10"
                  aria-invalid={!!error}
                  aria-describedby={error ? "home-email-error" : "home-email-help"}
                />

                {!error ? (
                  <p id="home-email-help" className="mt-2 text-right text-[14px] text-muted-foreground">
                    הקישור עשוי להגיע תוך דקה. מומלץ לבדוק גם בתיקיית הספאם.
                  </p>
                ) : (
                  <p id="home-email-error" className="mt-2 text-right text-[14px] text-danger" role="alert">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-[56px] w-full rounded-[14px] bg-black text-[18px] font-medium text-white transition hover:bg-neutral-900 disabled:opacity-60"
              >
                {loading ? "שולחים..." : "להרשמה ללא התחייבות"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <EmailSentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        email={sentTo ?? email.trim().toLowerCase()}
      />
    </main>
  )
}

