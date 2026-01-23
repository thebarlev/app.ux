"use client"

import { useEffect } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Receipt preview error:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-danger" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">שגיאה בטעינת התצוגה המקדימה</h2>
          <p className="text-muted-foreground">
            אירעה שגיאה בעת טעינת תצוגה מקדימה של הקבלה. אנא נסה שוב.
          </p>
          {error.message && (
            <p className="text-sm text-muted-foreground font-mono bg-muted p-3 rounded-lg mt-4 text-left" dir="ltr">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default">
            נסה שוב
          </Button>
          <Button onClick={() => window.location.href = "/dashboard/documents/receipt"} variant="outline">
            חזרה לקבלות
          </Button>
        </div>
      </div>
    </div>
  )
}
