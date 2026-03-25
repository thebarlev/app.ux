"use client"

import Image from "next/image"
import Link from "next/link"
import { ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IssueCard } from "@/components/auditor/scan-results/IssueCard"
import { IssueChecklist } from "@/components/auditor/scan-results/IssueChecklist"
import { ScanProgress } from "@/components/auditor/scan-progress/ScanProgress"
import { ScanHistoryAccordion } from "@/components/auditor/scan-history/ScanHistoryAccordion"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { PLAN_PRICES_USD } from "@/lib/auditor/pricing"
import type { StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"

type Props = {
  locale: AuditorLocale
  basePath: string
  scanId: string | null
  token: string | null
  status: StatusResponse | null
  hasActiveSubscription: boolean | null
  selectedPlanId: "basic" | "pro" | "premium"
  setSelectedPlanId: (plan: "basic" | "pro" | "premium") => void
  isStartingCheckout: boolean
  startCheckout: () => Promise<void>
  setShowChangePlanModal: (v: boolean) => void
  setShowCancelModal: (v: boolean) => void
  resetToNewScan: () => void
  whatsappUrl: string
}

export function AuditorStepThree(props: Props) {
  const {
    locale,
    basePath,
    scanId,
    token,
    status,
    hasActiveSubscription,
    selectedPlanId,
    setSelectedPlanId,
    isStartingCheckout,
    startCheckout,
    setShowChangePlanModal,
    setShowCancelModal,
    resetToNewScan,
    whatsappUrl,
  } = props

  const okStatus = status && status.ok === true ? status : null
  const issueCount = okStatus?.done ? (okStatus.issues_overview?.length ?? 0) : 0
  const isRtl = locale !== "en"
  const textAlign = "text-start"

  return (
    <div className="space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {hasActiveSubscription && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Link href={basePath} className="shrink-0">
            <Image src="/brand/vow.svg" alt="VOW" width={100} height={36} />
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  {locale === "en" ? "My account" : "החשבון שלי"}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem asChild>
                  <Link href={`${basePath}/invoices`}>{locale === "en" ? "View & download invoices" : "צפייה והורדת חשבוניות"}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`${basePath}/settings`}>{locale === "en" ? "Update profile" : "עדכון פרטים אישיים"}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowChangePlanModal(true)}>{locale === "en" ? "Change plan" : "מעביר חבילה"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCancelModal(true)} variant="destructive">
                  {locale === "en" ? "Cancel plan" : "ביטול חבילה"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/20"
            >
              <span>WhatsApp</span>
              <span>{locale === "en" ? "Contact" : "צור קשר"}</span>
            </a>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 ${textAlign}`}>
          <h2 className="text-xl font-bold text-slate-800">{locale === "en" ? "Audit report" : "דוח ביקורת"}</h2>
          <span className="font-mono text-xs text-slate-500">{scanId ? `# ${scanId}` : locale === "en" ? "Generating scan…" : "מייצר סריקה…"}</span>
        </div>

        {!okStatus && <ScanProgress currentStep="" isDone={false} locale={locale === "en" ? "en" : "he"} />}

        {okStatus && !okStatus.done && <ScanProgress currentStep={String(okStatus.step ?? "")} isDone={false} locale={locale === "en" ? "en" : "he"} />}

        {okStatus?.done && (
          <div className="space-y-6">
            {okStatus.warning && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                <span className="shrink-0">⚠</span>
                <span className="text-sm">{okStatus.warning}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-8">
                <div className={textAlign}>
                  <h3 className="text-base font-semibold text-slate-800">{locale === "en" ? "Areas to improve" : "דברים שכדאי לשפר"}</h3>
                  <p className="mt-0.5 text-sm text-slate-500">{locale === "en" ? "Prioritized by severity" : "ממויין לפי חומרה והשפעה"}</p>
                </div>
                {issueCount === 0 ? (
                  <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500 ${textAlign}`}>
                    {locale === "en" ? "No significant issues found" : "לא נמצאו בעיות כלליות משמעותיות"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(okStatus.issues_overview || []).map((issue: string, idx: number) => (
                      <IssueCard key={idx} severity="WARN" text={String(issue)} />
                    ))}
                  </div>
                )}
              </div>

              <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-4 ${textAlign}`}>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{locale === "en" ? "Audit score" : "ציון כללי"}</p>
                <div className={`mt-2 text-4xl font-bold text-[var(--primary)] ${textAlign}`}>
                  {typeof okStatus.score_total === "number" ? okStatus.score_total : "—"}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className={textAlign}>
                    {locale === "en" ? "AI Readiness" : "מוכנות AI"}: {typeof okStatus.score_ai === "number" ? okStatus.score_ai : "—"}
                  </div>
                  <div className={textAlign}>
                    {locale === "en" ? "SEO Readiness" : "חשיפה בחיפוש"}: {typeof okStatus.score_search === "number" ? okStatus.score_search : "—"}
                  </div>
                </div>
              </div>
            </div>

            <IssueChecklist
              items={(okStatus.issues_overview || []).map((s: unknown) => String(s))}
              title={locale === "en" ? "What's missing" : "מה חסר"}
              description={locale === "en" ? "Items to address for better AI & SEO visibility" : "מה צריך לעשות"}
              emptyMessage={locale === "en" ? "No major issues found." : "לא נמצאו בעיות מהותיות."}
            />

            {!hasActiveSubscription && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className={textAlign}>
                  <h3 className="text-base font-bold text-slate-800">{locale === "en" ? "Pricing — SEO / AI" : "מחירון — SEO / AI אורגני"}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {locale === "en"
                      ? "Choose a plan for the full report & improvement plan. Monthly billing, cancel anytime."
                      : "בחרו חבילה כדי לראות את הדוח המלא ולקבל תכנית שיפור. החיוב חודשי ומתחדש, וכולל מע״מ."}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {(["basic", "pro", "premium"] as const).map((plan) => (
                    <div
                      key={plan}
                      className={`cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all ${selectedPlanId === plan ? "ring-2 ring-primary ring-offset-2" : ""}`}
                      onClick={() => setSelectedPlanId(plan)}
                      role="button"
                      tabIndex={0}
                    >
                      {plan === "pro" && (
                        <span className="mb-2 inline-block rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-bold text-white">
                          {locale === "en" ? "Most popular" : "המומלץ ביותר"}
                        </span>
                      )}
                      <h4 className="font-bold text-slate-800">
                        {plan === "basic" && (locale === "en" ? "Basic" : "בסיסי")}
                        {plan === "pro" && (locale === "en" ? "Pro" : "מקצועי")}
                        {plan === "premium" && (locale === "en" ? "Premium" : "מומחים")}
                      </h4>
                      <div className="mt-1 text-sm text-slate-600">
                        {plan === "basic" && (locale === "en" ? <>${PLAN_PRICES_USD.basic}/mo</> : <>97 ₪/חודש</>)}
                        {plan === "pro" && (locale === "en" ? <>${PLAN_PRICES_USD.pro}/mo</> : <>197 ₪/חודש</>)}
                        {plan === "premium" && (locale === "en" ? <>From ${PLAN_PRICES_USD.premium}/mo</> : <>החל מ־997 ₪/חודש</>)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs text-slate-500">
                    {locale === "en" ? "After payment you'll get an email with login link." : "מיד לאחר התשלום נשלח אליכם מייל עם קישור להתחברות ולהמשך."}
                  </p>
                  <Button onClick={startCheckout} disabled={isStartingCheckout} className="gap-2">
                    {isStartingCheckout ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {locale === "en" ? "Processing…" : "ממשיכים לתשלום…"}
                      </>
                    ) : locale === "en" ? (
                      "Continue to payment"
                    ) : (
                      "המשך לתשלום"
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6">
              <a
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                href={scanId && token ? `${basePath}/${encodeURIComponent(scanId)}?token=${encodeURIComponent(token)}` : basePath}
              >
                <span>🔗</span>
                {locale === "en" ? "Share report" : "שיתוף הדוח"}
              </a>
              <Button variant="outline" onClick={resetToNewScan}>
                <span className={locale === "en" ? "mr-2" : "ml-2"}>＋</span>
                {locale === "en" ? "New scan" : "סריקה חדשה"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ScanHistoryAccordion locale={locale === "en" ? "en" : "he"} currentScanId={scanId} />
    </div>
  )
}
