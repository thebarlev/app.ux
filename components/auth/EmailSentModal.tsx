"use client"

import * as React from "react"
import { Send, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog"

type EmailSentModalProps = {
  open: boolean
  onClose: () => void
  email: string
}

export function EmailSentModal({ open, onClose, email }: EmailSentModalProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <AlertDialogContent
        dir="rtl"
        className={cn(
          "max-w-[560px] p-[44px] rounded-[24px] border-0",
          "bg-modal text-modal-fg shadow-[0_0_13px_0_rgba(0,0,0,0.10)]"
        )}
        onEscapeKeyDown={() => onClose()}
      >
        {/* Close (top-left) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute left-5 top-5 rounded-[10px] p-2 opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="סגירה"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-black/5">
          <Send className="h-9 w-9" />
        </div>

        <div className="text-center">
          <h2 className="text-[24px] font-bold leading-tight">היי שלחנו לך מייל לאימות,</h2>

          <p className="mt-4 text-[18px] leading-relaxed">
            שלחנו קישור לכתובת{" "}
            <span className="font-semibold" dir="ltr">
              {email}
            </span>
            . לחץ/י עליו כדי להמשיך בהרשמה.
          </p>

          <p className="mt-3 text-[16px] opacity-90">לא רואה? מומלץ לבדוק גם בתיקיית הספאם.</p>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

