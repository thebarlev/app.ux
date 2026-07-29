"use client"

import { AuditorStepOne } from "@/components/auditor/home/ui/AuditorStepOne"
import { AuditorStepTwo } from "@/components/auditor/home/ui/AuditorStepTwo"
import { AuditorStepThree } from "@/components/auditor/home/ui/AuditorStepThree"
import { AuditorLeadGate } from "@/components/auditor/home/ui/AuditorLeadGate"
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

      {controller.step === 2 ? (
        <AuditorStepTwo locale={locale} status={controller.status} step2IsWorking={controller.step2IsWorking} />
      ) : null}

      {controller.step === "gate" ? (
        <AuditorLeadGate
          locale={locale}
          isSubmitting={controller.isSubmittingLead}
          onSubmit={controller.submitLead}
        />
      ) : null}

      {controller.step === 3 ? (
        <AuditorStepThree
          locale={locale}
          basePath={basePath}
          scanId={controller.scanId}
          token={controller.token}
          status={controller.status}
          hasActiveSubscription={controller.hasActiveSubscription}
          selectedPlanId={controller.selectedPlanId}
          setSelectedPlanId={controller.setSelectedPlanId}
          isStartingCheckout={controller.isStartingCheckout}
          startCheckout={controller.startCheckout}
          setShowChangePlanModal={controller.setShowChangePlanModal}
          setShowCancelModal={controller.setShowCancelModal}
          resetToNewScan={controller.resetToNewScan}
          whatsappUrl={WHATSAPP_URL}
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