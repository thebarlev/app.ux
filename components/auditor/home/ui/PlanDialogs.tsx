"use client"

import { Loader2 } from "lucide-react"
import ConfirmDialog from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { PLAN_PRICES_USD } from "@/lib/auditor/pricing"

type Props = {
  locale: AuditorLocale
  showChangePlanModal: boolean
  setShowChangePlanModal: (value: boolean) => void
  showCancelModal: boolean
  setShowCancelModal: (value: boolean) => void
  changePlanTarget: "basic" | "pro"
  setChangePlanTarget: (value: "basic" | "pro") => void
  isChangingPlan: boolean
  isCanceling: boolean
  handleChangePlan: () => Promise<void>
  handleCancelSubscription: () => Promise<void>
}

export function PlanDialogs(props: Props) {
  const {
    locale,
    showChangePlanModal,
    setShowChangePlanModal,
    showCancelModal,
    setShowCancelModal,
    changePlanTarget,
    setChangePlanTarget,
    isChangingPlan,
    isCanceling,
    handleChangePlan,
    handleCancelSubscription,
  } = props
  return (
    <>
      <Dialog open={showChangePlanModal} onOpenChange={setShowChangePlanModal}>
        <DialogContent className="max-w-md bg-white text-gray-900 [&_.text-muted-foreground]:text-gray-600" dir={locale === "en" ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>{locale === "en" ? "Change plan" : "מעביר חבילה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {locale === "en" ? "Choose a new plan. Change takes effect at next billing cycle." : "בחרו חבילה חדשה. השינוי ייכנס לתוקף בתחילת תקופת החיוב הבאה."}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setChangePlanTarget("basic")}
                className={`flex-1 rounded-ui border p-4 ${locale === "en" ? "text-left" : "text-right"} transition ${
                  changePlanTarget === "basic" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="font-semibold">{locale === "en" ? "Basic" : "בסיסי"}</div>
                <div className="text-sm text-muted-foreground">{locale === "en" ? `$${PLAN_PRICES_USD.basic}/mo` : "97 ₪/חודש"}</div>
              </button>
              <button
                type="button"
                onClick={() => setChangePlanTarget("pro")}
                className={`flex-1 rounded-ui border p-4 ${locale === "en" ? "text-left" : "text-right"} transition ${
                  changePlanTarget === "pro" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="font-semibold">{locale === "en" ? "Pro" : "מקצועי"}</div>
                <div className="text-sm text-muted-foreground">{locale === "en" ? `$${PLAN_PRICES_USD.pro}/mo` : "497 ₪/חודש"}</div>
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowChangePlanModal(false)}>
                {locale === "en" ? "Cancel" : "ביטול"}
              </Button>
              <Button onClick={handleChangePlan} disabled={isChangingPlan}>
                {isChangingPlan ? (
                  <>
                    <Loader2 className={`h-4 w-4 animate-spin ${locale === "en" ? "mr-2" : "ml-2"}`} />
                    {locale === "en" ? "Updating…" : "מעדכן…"}
                  </>
                ) : locale === "en" ? (
                  "Confirm"
                ) : (
                  "אישור"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        title={locale === "en" ? "Cancel subscription" : "ביטול מנוי"}
        message={locale === "en" ? "Subscription ends at current billing period. No further charges." : "המנוי יסתיים בסוף תקופת החיוב הנוכחית. לא יגבה חיוב נוסף."}
        confirmText={locale === "en" ? "Confirm cancel" : "אשר ביטול"}
        cancelText={locale === "en" ? "Back" : "חזור"}
        destructive
        onConfirm={handleCancelSubscription}
      />
    </>
  )
}
