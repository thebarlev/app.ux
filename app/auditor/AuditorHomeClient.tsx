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

export default function AuditorHomeClient(props?: AuditorHomeProps) {
  const locale = props?.locale ?? "he"
  const basePath = props?.basePath ?? "/auditor"
  const controller = useAuditorHomeController({ locale, basePath })

  return (
    <div dir={locale === "en" ? "ltr" : "rtl"} className="space-y-6">
      {controller.error ? (
        <div className="rounded-ui border border-danger/40 bg-danger/5 p-3 text-sm text-danger text-start">{controller.error}</div>
      ) : null}

      {controller.step === 1 ? (
        <AuditorStepOne
          locale={locale}
          siteUrl={controller.siteUrl}
          setSiteUrl={controller.setSiteUrl}
          canGoToDetails={controller.canGoToDetails}
          isSubmitting={controller.isSubmitting}
          onStart={controller.onStart}
        />
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
        <AuditorStepTwo
          locale={locale}
          status={controller.status}
          step2IsWorking={controller.step2IsWorking}
          siteUrl={controller.siteUrl}
        />
      ) : null}

      {controller.step === "gate" ? (
        <AuditorLeadGate
          locale={locale}
          isSubmitting={controller.isSubmittingLead}
          pagesScanned={controller.pagesScanned}
          issuesCount={controller.issuesCount}
          noScore={controller.scanEndedWithoutScore}
          onSubmit={controller.submitLead}
        />
      ) : null}

      {/*
        Details are in, and there is no report to open. The team has the lead by
        email already — sendAuditorLead fires inside lead-and-scan for both
        creation paths — so this states the callback as a commitment rather than
        an apology, and still offers another address for anyone who would rather
        not wait.
      */}
      {controller.step === 3 && controller.leadWithoutScore ? (
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
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
        </div>
      ) : null}

      {controller.step === 3 && !controller.leadWithoutScore ? (
        <AuditorReportV3
          locale={locale}
          status={controller.status}
          whatsappUrl={WHATSAPP_URL}
          emailCopy={controller.leadEmailCopy}
          scanId={controller.scanId}
          /*
           * Where a chosen plan goes.
           *
           * Nowhere yet, on purpose. The three link_* plans are not rows in
           * auditor_plans until stage 2, and /auditor/checkout is hard-404'd by
           * the auditor block, so there is no flow to hand them to. What this
           * does is record the choice in the URL, which costs nothing, breaks
           * nothing, and means the two values stage 3 needs — which plan, which
           * scan — are already where it will look for them.
           *
           * replaceState rather than a router push: the visitor stays on their
           * report, and the choice should not become a history entry they have
           * to press back through.
           */
          onSelectPlan={(plan, scanId) => {
            if (typeof window === "undefined") return
            const url = new URL(window.location.href)
            url.searchParams.set("plan", plan)
            if (scanId) url.searchParams.set("scanId", scanId)
            window.history.replaceState(null, "", url.toString())
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