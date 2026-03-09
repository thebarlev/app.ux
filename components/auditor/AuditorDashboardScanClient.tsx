"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { AuditorScanResults } from "./AuditorScanResults"

function normalizeDomain(input: string): string {
  const raw = String(input || "").trim()
  if (!raw) return ""
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`
}

const STRINGS = {
  he: {
    placeholder: "הזן את דומיין האתר שלך",
    runAudit: "הרץ בדיקה",
    scanning: "סורק...",
  },
  en: {
    placeholder: "Enter your website domain",
    runAudit: "Run Audit",
    scanning: "Scanning...",
  },
}

export function AuditorDashboardScanClient({
  locale = "he",
  basePath = "/auditor",
}: {
  locale?: "he" | "en"
  basePath?: string
}) {
  const t = STRINGS[locale]
  const isRtl = locale === "he"
  const textAlign = isRtl ? "text-right" : "text-left"

  const [domain, setDomain] = useState("")
  const [scanId, setScanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleScan = async () => {
    const url = normalizeDomain(domain)
    if (!url) {
      setError(locale === "he" ? "נא להזין דומיין" : "Please enter a domain")
      return
    }
    setError(null)
    setScanId(null)
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/auditor/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || (locale === "he" ? "שגיאה בהפעלת הסריקה" : "Failed to start scan"))
        return
      }
      if (data.scanId) {
        setScanId(data.scanId)
      }
    } catch {
      setError(locale === "he" ? "שגיאה בהפעלת הסריקה" : "Failed to start scan")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className={`flex flex-col sm:flex-row gap-3 ${isRtl ? "sm:flex-row-reverse" : ""}`}>
            <Input
              type="text"
              placeholder={t.placeholder}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              className="flex-1"
              dir="ltr"
            />
            <Button onClick={handleScan} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.scanning}
                </>
              ) : (
                t.runAudit
              )}
            </Button>
          </div>
          {error && <p className={`mt-2 text-sm text-danger ${textAlign}`}>{error}</p>}
        </CardContent>
      </Card>

      {scanId && (
        <AuditorScanResults scanId={scanId} locale={locale} basePath={basePath} showBackExport={false} />
      )}
    </div>
  )
}
