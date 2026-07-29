"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { AuditorReportTeaser } from "@/components/auditor/home/ui/AuditorReportTeaser"

type Props = {
  locale: AuditorLocale
  isSubmitting: boolean
  onSubmit: (lead: {
    full_name: string
    phone: string
    email: string
    consent_terms: boolean
    consent_contact: boolean
  }) => void
}

const T = {
  he: {
    title: "השאירו פרטים לקבלת התוצאות המלאות",
    subtitle: "הסריקה הסתיימה. הדוח המלא מחכה לכם.",
    name: "שם מלא",
    phone: "טלפון",
    email: "אימייל",
    terms: "אני מאשר/ת את תנאי השימוש ומדיניות הפרטיות",
    contact: "אני מסכים/ה לקבל עדכונים ותכנים שיווקיים",
    cta: "קבלו את הדוח המלא",
    errName: "נא למלא שם מלא",
    errPhone: "נא למלא מספר טלפון",
    errEmail: "נא למלא כתובת אימייל תקינה",
    errTerms: "יש לאשר את תנאי השימוש",
  },
  en: {
    title: "Leave your details to see the full results",
    subtitle: "The scan is done. Your full report is waiting.",
    name: "Full name",
    phone: "Phone",
    email: "Email",
    terms: "I accept the terms of use and privacy policy",
    contact: "I agree to receive updates and marketing content",
    cta: "Get the full report",
    errName: "Please enter your full name",
    errPhone: "Please enter a phone number",
    errEmail: "Please enter a valid email address",
    errTerms: "You must accept the terms of use",
  },
} as const

export function AuditorLeadGate({ locale, isSubmitting, onSubmit }: Props) {
  const t = T[locale === "en" ? "en" : "he"]
  const rtl = locale !== "en"

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentContact, setConsentContact] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = () => {
    // Mirrors auditorLeadSchema so a rejected submit is caught before the round
    // trip: name >= 2, phone >= 6, a real email, and terms are mandatory.
    if (fullName.trim().length < 2) return setLocalError(t.errName)
    if (phone.trim().length < 6) return setLocalError(t.errPhone)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setLocalError(t.errEmail)
    if (!consentTerms) return setLocalError(t.errTerms)

    setLocalError(null)
    onSubmit({
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      consent_terms: consentTerms,
      consent_contact: consentContact,
    })
  }

  return (
    <div className="relative min-h-[80svh] w-full" dir={rtl ? "rtl" : "ltr"}>
      {/*
        The report the visitor is about to get, blurred out behind the form.
        Decorative and inert: aria-hidden keeps it out of the accessibility tree
        and pointer-events-none stops it swallowing taps meant for the fields,
        which matters on mobile where the two overlap almost entirely.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none overflow-hidden blur-[6px] opacity-40 sm:blur-[8px] sm:opacity-50"
      >
        <AuditorReportTeaser locale={locale} />
      </div>

      {/* Fades the teaser out toward the form so the text never fights the shapes. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/70 via-white/85 to-white" />

      <div className="relative flex min-h-[80svh] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white/95 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          <h2 className="text-balance text-xl font-semibold leading-snug sm:text-2xl">{t.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.subtitle}</p>

          <div className="mt-6 space-y-3">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t.name}
              autoComplete="name"
              className="h-11 rounded-xl bg-white"
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.phone}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              style={{ direction: "ltr", textAlign: rtl ? "right" : "left" }}
              className="h-11 rounded-xl bg-white"
            />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.email}
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              style={{ direction: "ltr", textAlign: rtl ? "right" : "left" }}
              className="h-11 rounded-xl bg-white"
            />
          </div>

          <div className="mt-4 space-y-2.5 text-sm">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={consentTerms}
                onChange={(e) => setConsentTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-fg"
              />
              <span className="text-muted-foreground">{t.terms}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={consentContact}
                onChange={(e) => setConsentContact(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-fg"
              />
              <span className="text-muted-foreground">{t.contact}</span>
            </label>
          </div>

          {localError ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {localError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-fg text-base font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {t.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
