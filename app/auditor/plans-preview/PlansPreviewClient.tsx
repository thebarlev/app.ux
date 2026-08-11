// TEMPORARY — see page.tsx. Delete this directory before merging to main.
"use client"

import { useState } from "react"
import { AuditorPlans, type AuditorPlanSlug } from "@/components/auditor/home/ui/AuditorPlans"
import { AUDITOR_SCOPE, AuditorScaleStyles } from "@/components/auditor/home/ui/auditor-scale"

export default function PlansPreviewClient() {
  /**
   * The chosen plan, shown on screen rather than sent anywhere.
   *
   * On the real page the handler writes plan and scanId into the URL, because
   * there is no signup flow to hand them to yet. Here it is echoed visibly so
   * the buttons can be confirmed to carry the right slug without opening a
   * console.
   */
  const [picked, setPicked] = useState<{ plan: AuditorPlanSlug; scanId: string | null } | null>(null)

  return (
    <div className={AUDITOR_SCOPE} dir="rtl" style={{ background: "#fff", fontFamily: "'Assistant',system-ui,Arial,sans-serif" }}>
      <AuditorScaleStyles />

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px 16px 0", color: "#3A465F", fontSize: 13, lineHeight: 1.6 }}>
        <b style={{ color: "#101B31" }}>תצוגה מקדימה · הסקשן בלבד</b>
        <p style={{ margin: "2px 0 0" }}>
          הראוט הזה קיים ב-Preview בלבד ויימחק לפני מיזוג. הכפתורים לא מובילים לתשלום — אין עדיין מסלול הרשמה — אלא מציגים כאן את המסלול שנבחר.
        </p>
        <p style={{ margin: "8px 0 0", minHeight: 20, fontWeight: 800, color: picked ? "#1E9E63" : "#78859B" }}>
          {picked ? `נבחר: ${picked.plan} · scanId: ${picked.scanId ?? "—"}` : "לא נבחר מסלול"}
        </p>
      </div>

      <AuditorPlans
        locale="he"
        scanId="preview-scan"
        onSelectPlan={(plan, scanId) => setPicked({ plan, scanId })}
      />
    </div>
  )
}
