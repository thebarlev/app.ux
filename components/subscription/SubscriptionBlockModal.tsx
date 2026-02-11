"use client"

import { Button } from "@/components/ui/button"

export type SubscriptionBlockKind = "free_quota" | "renewal_required"

export function SubscriptionBlockModal(props: {
  isOpen: boolean
  kind: SubscriptionBlockKind
  onClose: () => void
  onPrimary: () => void
}) {
  const { isOpen, kind, onClose, onPrimary } = props
  if (!isOpen) return null

  const copy =
    kind === "free_quota"
      ? {
          title: "הגעת למכסה",
          body: "ניצלת במלואו את המכסה במסגרת המסלול החינמי. ליצירת מסמך חדש יש לשדרג.",
          primary: "שדרוג המנוי",
          secondary: "סגור",
        }
      : {
          title: "נדרש חידוש מנוי",
          body: "כדי להמשיך להפיק מסמכים יש לחדש את המנוי.",
          primary: "חידוש מנוי",
          secondary: "סגור",
        }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-ui bg-white p-6 shadow-ui-sm text-right"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xl font-bold text-fg">{copy.title}</div>
        <div className="mt-2 text-sm text-muted-fg">{copy.body}</div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {copy.secondary}
          </Button>
          <Button variant="primary" onClick={onPrimary}>
            {copy.primary}
          </Button>
        </div>
      </div>
    </div>
  )
}

