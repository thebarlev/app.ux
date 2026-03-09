"use client"

import { AuditorScanResults } from "@/components/auditor/AuditorScanResults"

export default function AuditorScanClient({ scanId }: { scanId: string }) {
  return <AuditorScanResults scanId={scanId} locale="he" basePath="/auditor" showBackExport />
}
