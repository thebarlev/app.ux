"use client"

import { AuditorStepOne } from "@/components/auditor/home/ui/AuditorStepOne"
import { AuditorStepTwo } from "@/components/auditor/home/ui/AuditorStepTwo"
import { AuditorLeadGate } from "@/components/auditor/home/ui/AuditorLeadGate"
import { AuditorReportV3 } from "@/components/auditor/home/ui/AuditorReportV3"
import { PlanDialogs } from "@/components/auditor/home/ui/PlanDialogs"
import { useAuditorHomeController } from "@/components/auditor/home/logic/useAuditorHomeController"
import type { AuditorHomeProps } from "@/components/auditor/home/logic/auditor-home-types"

const WHATSAPP_PHONE = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_AUDITOR_WHATSAPP_PHONE) || "972545215193"
const WHATSAPP_URL = `https://wa.me/${String(WHATSAPP_PHONE).replace(/^0+/, "")}`

/**
 * The page measure, moved here from app/auditor/page.tsx.
 *
 * Same three classes and the same values as the wrapper that used to hold the
 * whole flow, applied per block instead. Every step keeps the layout it had; the
 * report is the one thing deliberately left outside it, so its hero can run a
 * full-bleed band to the edges of the viewport.
 */
const MEASURE = "mx-auto max-w-5xl px-4 sm:px-6"

export default function AuditorHomeClient(props?: AuditorHomeProps) {
  const locale = props?.locale ?? "he"
  const basePath = props?.basePath ?? "/auditor"
  const controller = useAuditorHomeController({ locale, basePath })

  return (
    <div dir={locale === "en" ? "ltr" : "rtl"} className="space-y-6">
      {controller.error ? (
        <div className={MEASURE}><div className="rounded-ui border border-danger/40 bg-danger/5 p-3 text-sm text-danger text-start">{controller.error}</div></div>
      ) : null}

      {controller.step === 1 ? (
        <div className={MEASURE}><AuditorStepOne
          locale={locale}
          siteUrl={controller.siteUrl}
          setSiteUrl={controller.setSiteUrl}
          canGoToDetails={controller.canGoToDetails}
          isSubmitting={controller.isSubmitting}
          onStart={controller.onStart}
        /></div>
      ) : null}

      {/*
        The step 2 failure card is gone, and deliberately so.

        It rendered on scanEndedWithoutScore, which is now exactly the condition
        that opens the gate — so it had become a single frame of red before the
        form replaced it. Rule 5 still holds: the explicit failure state moved to
        the two places the visitor actually reaches, the gate's noScore copy
        before details and the block below after them.
      */}
      {controller.step === 2 ? (
        <div className={MEASURE}><AuditorStepTwo
          locale={locale}
          status={controller.status}
          step2IsWorking={controller.step2IsWorking}
          siteUrl={controller.siteUrl}
        /></div>
      ) : null}

      {controller.step === "gate" ? (
        <div className={MEASURE}><AuditorLeadGate
          locale={locale}
          isSubmitting={controller.isSubmittingLead}
          pagesScanned={controller.pagesScanned}
          issuesCount={controller.issuesCount}
          noScore={controller.scanEndedWithoutScore}
          onSubmit={controller.submitLead}
        /></div>
      ) : null}

      {/*
        Details are in, and there is no report to open. The team has the lead by
        email already — sendAuditorLead fires inside lead-and-scan for both
        creation paths — so this states the callback as a commitment rather than
        an apology, and still offers another address for anyone who would rather
        not wait.
      */}
      {/*
        Its own measure, not MEASURE: this card is max-w-md, and putting both
        max-w-md and MEASURE's max-w-5xl in one class list leaves which one wins
        to stylesheet order rather than to intent.
      */}
      {controller.step === 3 && controller.leadWithoutScore ? (
        <div className="mx-auto max-w-md px-4 sm:px-6"><div className="rounded-2xl border border-border bg-card p-6 text-center">
          <h2 className="text-lg font-semibold">
            {locale === "en" ? "We couldn't scan this site" : "יש תקלה בסריקת האתר"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {locale === "en"
              ? "Your details are with us. Try another address, or leave it with us — we'll look into what blocked the scan and get back to you."
              : "הפרטים שלכם אצלנו. נסו כתובת אחרת, או השאירו לנו — נבדוק מה חסם את הסריקה ונחזור אליכם."}
          </p>
          <button
            type="button"
            onClick={controller.resetToNewScan}
            className="mt-5 h-11 w-full rounded-full bg-fg text-sm font-medium text-white transition hover:opacity-90"
          >
            {locale === "en" ? "Scan another address" : "לסרוק כתובת אחרת"}
          </button>
        </div></div>
      ) : null}

      {controller.step === 3 && !controller.leadWithoutScore ? (
        <AuditorReportV3
          locale={locale}
          status={controller.status}
          whatsappUrl={WHATSAPP_URL}
          emailCopy={controller.leadEmailCopy}
          scanId={controller.scanId}
          /*
           * Where a chosen plan goes: to the checkout.
           *
           * ⛔ IT USED TO ONLY WRITE THE CHOICE INTO THE ADDRESS BAR.
           *
           * The comment this replaces was accurate when it was written in stage 1 —
           * "the three link_* plans are not rows in auditor_plans until stage 2, and
           * /auditor/checkout is hard-404'd by the auditor block, so there is no flow
           * to hand them to" — so it called window.history.replaceState and stopped.
           * Stage 3 built the checkout and nobody came back here. Every click on
           * "בחירת מסלול" changed the URL and did nothing else: no navigation, no
           * request, no console error. A silent success, which is why it survived to a
           * 360 round.
           *
           * ⚠️ THREE PARAMS, NOT TWO. `token` is the one that decides it.
           *
           * app/auditor/checkout/page.tsx refuses on `!planId || !scanId || !token`.
           * With plan and scanId alone, every click would land on CheckoutRefusal
           * "missing_params" — a fix that reads correctly, typechecks, deploys clean,
           * and fails on the first click. The scan access token is already in
           * controller state; it is missing from the URL only because the live flow
           * walks its steps in client state and never puts it there.
           *
           * If the token is genuinely absent we navigate anyway rather than doing
           * nothing. The refusal is a readable screen that tells the visitor to scan
           * again — worse than the checkout, far better than the silence it replaces.
           *
           * router.push, not replaceState: this IS a navigation now, and back should
           * return the visitor to their report.
           *
           * basePath rather than a literal — it is /en/auditor on the English page.
           */
          onSelectPlan={(plan, planScanId) => {
            const sid = planScanId || controller.scanId || ""
            const params = new URLSearchParams({ plan })
            if (sid) params.set("scanId", sid)
            if (controller.token) params.set("token", controller.token)
            controller.router.push(`${basePath}/checkout?${params.toString()}`)
          }}
        />
      ) : null}

      <PlanDialogs
        locale={locale}
        showChangePlanModal={controller.showChangePlanModal}
        setShowChangePlanModal={controller.setShowChangePlanModal}
        showCancelModal={controller.showCancelModal}
        setShowCancelModal={controller.setShowCancelModal}
        changePlanTarget={controller.changePlanTarget}
        setChangePlanTarget={controller.setChangePlanTarget}
        isChangingPlan={controller.isChangingPlan}
        isCanceling={controller.isCanceling}
        handleChangePlan={controller.handleChangePlan}
        handleCancelSubscription={controller.handleCancelSubscription}
      />
    </div>
  )
}