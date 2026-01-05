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
    console.error("Admin error:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-danger" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-fg">Something went wrong</h2>
          <p className="text-muted-fg">
            An error occurred in the admin panel. Please try again.
          </p>
          {error.message && (
            <p className="text-sm text-muted-fg font-mono bg-muted p-3 rounded-ui mt-4">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default">
            Try Again
          </Button>
          <Button onClick={() => window.location.href = "/admin"} variant="outline">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
