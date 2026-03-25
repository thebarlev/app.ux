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

export function AuditorStepOne(props: Props) {
  const { locale, siteUrl, setSiteUrl, canGoToDetails, isSubmitting, onStart } = props
  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-col items-center justify-center gap-10 text-center">
      <Image src="/brand/vow.svg" alt="VOW" width={140} height={48} priority />
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
              <button
                type="button"
                onClick={onStart}
                disabled={!canGoToDetails}
                aria-label="Continue"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition hover:text-fg disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onStart}
                disabled={!canGoToDetails}
                aria-label="המשך"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition hover:text-fg disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              </button>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onStart()
                }}
                placeholder="כתובת אתר / עמוד נחיתה"
                dir="ltr"
                style={{ direction: "ltr" }}
                className="h-12 rounded-full bg-white pr-12 pl-5 !text-left placeholder:!text-left shadow-sm"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
