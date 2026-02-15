"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export type InvoiceDecisionType = "CANCEL" | "CONTINUE" | "FURTHEROBJECTION"

export function InvoiceDecisionModal(props: {
  open: boolean
  errorId: string
  onOpenChange: (open: boolean) => void
  onSelect: (decision: InvoiceDecisionType) => Promise<void>
}) {
  const [busy, setBusy] = useState<InvoiceDecisionType | null>(null)

  const run = async (decision: InvoiceDecisionType) => {
    setBusy(decision)
    try {
      await props.onSelect(decision)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">רשות המסים לא אישרה מספר הקצאה</DialogTitle>
          <DialogDescription className="text-right">
            מזהה שגיאה: <span className="font-mono">{props.errorId}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="text-right text-sm text-muted-foreground">
          בחר/י כיצד להמשיך. פעולה זו תישלח לרשות המסים.
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:items-stretch">
          <Button
            variant="destructive"
            onClick={() => run("CANCEL")}
            disabled={busy !== null}
          >
            ביטול מסמך
          </Button>
          <Button
            onClick={() => run("CONTINUE")}
            disabled={busy !== null}
          >
            המשך ללא מספר הקצאה
          </Button>
          <Button
            variant="secondary"
            onClick={() => run("FURTHEROBJECTION")}
            disabled={busy !== null}
          >
            בקשת שימוע
          </Button>
          <Button variant="secondary" disabled>
            היפוך חיוב (לא זמין)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

