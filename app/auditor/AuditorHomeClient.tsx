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
        Rule 5: a failed scan gets an explicit failure. Not the gate — asking
        for details in exchange for a report that is not coming — and not an
        empty report.
      */}
      {controller.step === 2 && controller.scanEndedWithoutScore ? (
        <div className="mx-auto max-w-md rounded-2xl border border-danger/40 bg-danger/5 p-6 text-center">
          <h2 className="text-lg font-semibold">
            {locale === "en" ? "The scan did not complete" : "הסריקה לא הושלמה"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {locale === "en"
              ? "We could not finish reading this site, so there is no score to show. Check the address and try again."
              : "לא הצלחנו לסיים לקרוא את האתר, ולכן אין ציון להציג. בדקו את הכתובת ונסו שוב."}
          </p>
          <button
            type="button"
            onClick={controller.resetToNewScan}
            className="mt-5 h-11 w-full rounded-full bg-fg text-sm font-medium text-white transition hover:opacity-90"
          >
            {locale === "en" ? "Scan again" : "לסרוק שוב"}
          </button>
        </div>
      ) : null}

      {controller.step === 2 && !controller.scanEndedWithoutScore ? (
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
          onSubmit={controller.submitLead}
        />
      ) : null}

      {controller.step === 3 ? (
        <AuditorReportV3
          locale={locale}
          status={controller.status}
          whatsappUrl={WHATSAPP_URL}
          emailCopy={controller.leadEmailCopy}
          onUnlock={controller.startCheckout}
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