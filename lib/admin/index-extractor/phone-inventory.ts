import { readFile } from "node:fs/promises"
import path from "node:path"
import { normalizeAndClassifyPhone } from "@/lib/admin/index-extractor/normalize-phone"

export type PhoneInventoryItem = {
  phoneNumberRaw: string
  phoneNumberFormatted: string
  isVisibleInHtml: boolean
  sourceFile: string
  details: string
}

export type PhoneInventorySummary = {
  totalMatches: number
  visibleCount: number
  hiddenCount: number
  filesScanned: number
}

export type PhoneInventoryResult = {
  inventory: PhoneInventoryItem[]
  detectedPhoneRegex: string[]
  summary: PhoneInventorySummary
  footerIntegrationSuggestions: string[]
}

const INDEX_EXTRACTOR_SCOPED_FILES = [
  "app/admin/(app)/index-extractor/page.tsx",
  "components/admin/index-extractor/index-extractor-client.tsx",
  "app/api/admin/index-extractor/run/route.ts",
  "lib/admin/index-extractor/parse-contact-fields.ts",
  "lib/admin/index-extractor/normalize-phone.ts",
  "lib/admin/index-extractor/parse-structured-data.ts",
  "lib/admin/index-extractor/crawl.ts",
  "lib/admin/index-extractor/types.ts",
] as const

const PHONE_LIKE_REGEX = /(?:\+?\d[\d\s()./-]{7,}\d)/g
const TEL_LITERAL_REGEX = /tel:\s*([+()\d\s.-]{6,})/gi
const ENV_PHONE_ASSIGNMENT_REGEX = /\b([A-Z0-9_]*PHONE[A-Z0-9_]*)\b\s*[:=]\s*["'`]([^"'`]*\d[^"'`]*)["'`]/g
const REGEX_LITERAL_REGEX = /\/(?:\\\/|[^/\n])+\/[gimsuy]*/g

function isVisibleContext(line: string): boolean {
  const lower = line.toLowerCase()
  return (
    lower.includes("href=") ||
    lower.includes("tel:") ||
    lower.includes("button") ||
    lower.includes("link") ||
    lower.includes("placeholder")
  )
}

function cleanRawPhone(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function canonicalPhone(value: string): string {
  const normalized = normalizeAndClassifyPhone(value)
  return normalized.normalized || normalized.mobile || normalized.phone || cleanRawPhone(value)
}

function localIlFormat(canonical: string): string {
  const digits = String(canonical || "").replace(/[^\d+]/g, "")
  const asLocal = digits.startsWith("+972") ? `0${digits.slice(4)}` : /^972\d{8,9}$/.test(digits) ? `0${digits.slice(3)}` : digits
  if (!/^0\d{8,9}$/.test(asLocal)) return ""
  if (asLocal.length === 10) {
    return `${asLocal.slice(0, 3)}-${asLocal.slice(3, 6)}-${asLocal.slice(6)}`
  }
  return `${asLocal.slice(0, 2)}-${asLocal.slice(2, 5)}-${asLocal.slice(5)}`
}

function buildFormatted(raw: string): string {
  const canonical = canonicalPhone(raw)
  const local = localIlFormat(canonical)
  return local ? `${canonical} | ${local}` : canonical
}

function regexLooksPhone(regexLiteral: string): boolean {
  const lower = regexLiteral.toLowerCase()
  return lower.includes("tel") || lower.includes("phone") || lower.includes("\\d") || lower.includes("[0-9]")
}

function toItem(params: {
  raw: string
  sourceFile: string
  details: string
  isVisibleInHtml: boolean
}): PhoneInventoryItem | null {
  const raw = cleanRawPhone(params.raw)
  if (!raw) return null
  return {
    phoneNumberRaw: raw,
    phoneNumberFormatted: buildFormatted(raw),
    isVisibleInHtml: params.isVisibleInHtml,
    sourceFile: params.sourceFile,
    details: params.details,
  }
}

export async function scanIndexExtractorPhoneInventory(): Promise<PhoneInventoryResult> {
  const root = process.cwd()
  const inventory: PhoneInventoryItem[] = []
  const detectedPhoneRegex = new Set<string>()
  const seen = new Set<string>()

  for (const relPath of INDEX_EXTRACTOR_SCOPED_FILES) {
    const abs = path.join(root, relPath)
    const content = await readFile(abs, "utf-8").catch(() => "")
    if (!content) continue
    const lines = content.split(/\r?\n/g)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || ""
      const lineNo = i + 1
      const visible = isVisibleContext(line)

      for (const match of line.matchAll(TEL_LITERAL_REGEX)) {
        const raw = match[1] || ""
        const item = toItem({
          raw,
          sourceFile: relPath,
          details: `tel literal at line ${lineNo}: ${line.trim().slice(0, 120)}`,
          isVisibleInHtml: true,
        })
        if (!item) continue
        const key = `${item.sourceFile}|${item.phoneNumberRaw}|${item.details}`
        if (seen.has(key)) continue
        seen.add(key)
        inventory.push(item)
      }

      for (const match of line.matchAll(PHONE_LIKE_REGEX)) {
        const raw = match[0] || ""
        const digits = raw.replace(/[^\d]/g, "")
        if (digits.length < 7) continue
        const item = toItem({
          raw,
          sourceFile: relPath,
          details: `phone-like literal at line ${lineNo}: ${line.trim().slice(0, 120)}`,
          isVisibleInHtml: visible,
        })
        if (!item) continue
        const key = `${item.sourceFile}|${item.phoneNumberRaw}|${lineNo}`
        if (seen.has(key)) continue
        seen.add(key)
        inventory.push(item)
      }

      for (const match of line.matchAll(ENV_PHONE_ASSIGNMENT_REGEX)) {
        const envKey = match[1] || "PHONE_ENV"
        const raw = match[2] || ""
        const item = toItem({
          raw,
          sourceFile: relPath,
          details: `env/config assignment (${envKey}) at line ${lineNo}`,
          isVisibleInHtml: false,
        })
        if (!item) continue
        const key = `${item.sourceFile}|${item.phoneNumberRaw}|${envKey}|${lineNo}`
        if (seen.has(key)) continue
        seen.add(key)
        inventory.push(item)
      }

      for (const match of line.matchAll(REGEX_LITERAL_REGEX)) {
        const regexLiteral = match[0] || ""
        if (!regexLooksPhone(regexLiteral)) continue
        detectedPhoneRegex.add(`${relPath}: ${regexLiteral}`)
      }
    }
  }

  const visibleCount = inventory.filter((item) => item.isVisibleInHtml).length
  const hiddenCount = inventory.length - visibleCount

  return {
    inventory,
    detectedPhoneRegex: [...detectedPhoneRegex].sort(),
    summary: {
      totalMatches: inventory.length,
      visibleCount,
      hiddenCount,
      filesScanned: INDEX_EXTRACTOR_SCOPED_FILES.length,
    },
    footerIntegrationSuggestions: [
      "Create a shared FooterPhone component that receives phone from one typed config source.",
      "Keep phone values in one contact config module and consume it in Footer + Index Extractor diagnostics UI.",
    ],
  }
}
