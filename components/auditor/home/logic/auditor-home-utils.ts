import type { StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"

export function detectDomain(rawUrl: string): string | null {
  const input = String(rawUrl || "").trim()
  if (!input) return null
  try {
    const normalized = input.startsWith("http://") || input.startsWith("https://") ? input : `https://${input}`
    return new URL(normalized).hostname || null
  } catch {
    return null
  }
}

export function isScanFinished(status: StatusResponse | null): boolean {
  if (!status || status.ok !== true) return false
  const scanStatus = String(status.status || "").toLowerCase()
  return status.done === true || ["done", "failed", "completed", "finished"].includes(scanStatus)
}

export function isScanRunning(status: StatusResponse | null): boolean {
  if (!status || status.ok !== true) return false
  const scanStatus = String(status.status || "").toLowerCase()
  return scanStatus === "running" || scanStatus === "queued"
}
