"use client"

import Image from "next/image"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { AiScoreHero } from "@/components/auditor/home/ui/AiScoreHero"
import type { AuditorLocale } from "@/lib/auditor/locale"
import type { StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"

type Props = {
  locale: AuditorLocale
  basePath: string
  linkId: string
  scanId: string | null
  token: string | null
  status: StatusResponse | null
  step2IsWorking: boolean
}

export function AuditorStepTwo(props: Props) {
  const { locale, basePath, linkId, scanId, token, status, step2IsWorking } = props
  const runningStep = status && status.ok === true ? String(status.step || "") : ""
  const progress = status && status.ok === true && typeof status.progress === "number" ? Math.max(0, Math.min(100, Math.round(status.progress))) : null
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <Image src="/brand/black.svg" alt="VOW" width={140} height={48} priority={false} />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-4xl">{locale === "en" ? "Get your site score" : "קבלו ציון לאתר"}</h1>
        <p className="text-sm font-medium text-muted-foreground md:text-base">
          {locale === "en" ? "How visible is your site in Google & AI?" : "מהם הסיכויים של האתר שלכם להופיע בגוגל ו-AI"}
        </p>
      </div>
      <div className="w-full">
        <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-ui border border-border bg-white shadow-sm">
          {status && status.ok === true && status.screenshot_url ? (
            <Image src={status.screenshot_url} alt="Site preview" width={1440} height={900} className="h-auto w-full" />
          ) : (
            <div className="aspect-[16/9] w-full bg-gradient-to-b from-white to-muted" />
          )}
          {step2IsWorking && (
            <div className="absolute right-3 top-3 rounded-full border border-border bg-white/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-[1px]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {locale === "en"
                  ? `Scanning${typeof progress === "number" ? ` ${progress}%` : ""}…`
                  : `סורקים${typeof progress === "number" ? ` ${progress}%` : ""}…`}
              </span>
            </div>
          )}
        </div>
      </div>
      <AiScoreHero status={status} locale={locale} />
      {step2IsWorking && runningStep ? (
        <p className="text-xs text-muted-foreground">
          {locale === "en"
            ? `Current step: ${runningStep}${typeof progress === "number" ? ` (${progress}%)` : ""}`
            : `שלב נוכחי: ${runningStep}${typeof progress === "number" ? ` (${progress}%)` : ""}`}
        </p>
      ) : null}
      <div className="w-full max-w-md space-y-1 text-center">
        <h2>{locale === "en" ? "Want the full report?" : "רוצים לראות את הדוח המלא?"}</h2>
        <h3 className="text-[18px]">
          {locale === "en" ? "Sign up, pay & get instant access to the full report." : "הירשמו, שלמו ותעברו ישר לדוח המלא עם כל התוצאות וההמלצות."}
        </h3>
      </div>
      <div className="w-full max-w-md">
        <Link
          href={
            scanId && token
              ? `${basePath}/register?link_id=${encodeURIComponent(linkId)}&scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(token)}`
              : `${basePath}/register?link_id=${encodeURIComponent(linkId)}`
          }
          className="inline-flex h-14 w-full items-center justify-center rounded-none bg-black text-base text-white hover:bg-black/90"
        >
          {locale === "en" ? "Sign up & continue to payment" : "הרשמה והמשך לתשלום"}
        </Link>
      </div>
    </div>
  )
}
