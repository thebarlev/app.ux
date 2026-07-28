"use client"

import Image from "next/image"
import { ArrowRight, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { AuditorLocale } from "@/lib/auditor/locale"

type Props = {
  locale: AuditorLocale
  siteUrl: string
  setSiteUrl: (value: string) => void
  canGoToDetails: boolean
  isSubmitting: boolean
  onStart: () => void
}

/**
 * Direction from the first strong character — the rule dir="auto" implements.
 *
 * It is done in JS rather than left to the attribute because globals.css pins
 * `direction: rtl` on every input (the "כל שדות הקלט" block), at a specificity
 * the dir attribute cannot reach: dir="auto" only sets unicode-bidi, so the
 * field kept resolving RTL with a latin URL in it. The value below goes on the
 * inline style, which that rule has no !important to beat.
 *
 * Empty falls back to the page direction, so the Hebrew placeholder stays right.
 */
const STRONG_LTR = /[A-Za-z]/
/* Hebrew, Arabic, Syriac and their presentation forms. */
const STRONG_RTL = /[֐-׿؀-ۿ܀-޿יִ-﷿ﹰ-﻿]/

function resolveFieldDir(value: string, fallback: "rtl" | "ltr"): "rtl" | "ltr" {
  for (const ch of value) {
    if (STRONG_LTR.test(ch)) return "ltr"
    if (STRONG_RTL.test(ch)) return "rtl"
  }
  return fallback
}

export function AuditorStepOne(props: Props) {
  const { locale, siteUrl, setSiteUrl, canGoToDetails, isSubmitting, onStart } = props

  // The arrow sits at right-3, exactly where the Hebrew placeholder starts, so
  // it only appears once there is something to submit.
  const hasValue = siteUrl.trim().length > 0
  const fieldDir = resolveFieldDir(siteUrl, locale === "en" ? "ltr" : "rtl")

  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-col items-center justify-center gap-10 text-center">
      <Image src="/brand/black.svg" alt="Uxellent" width={140} height={48} priority />
      <h1 className="text-balance text-3xl font-semibold leading-tight md:text-4xl">
        {locale === "en" ? (
          <>How visible is your site in Google & AI search?</>
        ) : (
          <>
            כמה סיכוי יש לאתר שלך להופיע
            <br />
            בגוגל ובחיפוש AI?
          </>
        )}
      </h1>
      <div className={`w-full max-w-xl ${locale === "en" ? "flex flex-row" : ""}`} dir={locale === "en" ? "ltr" : undefined}>
        <div className="relative w-full">
          {locale === "en" ? (
            <>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onStart()
                }}
                placeholder="Website URL / landing page"
                dir="ltr"
                style={{ direction: "ltr" }}
                className="h-12 rounded-full bg-white pr-12 pl-5 !text-left placeholder:!text-left shadow-sm"
              />
              {hasValue ? (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={!canGoToDetails}
                  aria-label="Continue"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition hover:text-fg disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                </button>
              ) : null}
            </>
          ) : (
            <>
              {hasValue ? (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={!canGoToDetails}
                  aria-label="המשך"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition hover:text-fg disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                </button>
              ) : null}
              {/*
                Paddings stay physical: the arrow is absolutely positioned at
                right-3 in both directions, and pr-12 is the gap that keeps the
                text from running under it once the arrow appears.
              */}
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onStart()
                }}
                placeholder="כתובת אתר / עמוד נחיתה"
                dir={fieldDir}
                style={{ direction: fieldDir, textAlign: fieldDir === "rtl" ? "right" : "left" }}
                className="h-12 rounded-full bg-white pr-12 pl-5 shadow-sm"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
