export type PhoneNormalization = {
  raw: string
  normalized: string
  phone: string
  mobile: string
  confidence: number
}

function compact(value: string): string {
  return String(value || "")
    .replace(/^(tel:|callto:)/i, "")
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .trim()
}

function extractPhoneLike(raw: string): string {
  const direct = compact(raw)
  if (direct) return direct

  const matches = String(raw || "").match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) || []
  const normalized = matches.map((m) => compact(m)).filter(Boolean)
  if (normalized.length === 0) return ""
  normalized.sort((a, b) => b.length - a.length)
  return normalized[0] || ""
}

function looksLikeTimestamp(value: string): boolean {
  const digits = String(value || "").replace(/[^\d]/g, "")
  if (digits.length < 12 || digits.length > 15) return false
  if (digits.startsWith("972")) return false
  return true
}

function toIsraeliLocal(value: string): string {
  if (!value) return value
  if (value.startsWith("+972")) {
    const rest = value.slice(4)
    return `0${rest}`
  }
  if (/^972\d{8,9}$/.test(value)) {
    return `0${value.slice(3)}`
  }
  return value
}

function looksMobileIL(num: string): boolean {
  const n = toIsraeliLocal(num)
  return /^05\d{8}$/.test(n)
}

function looksLandlineIL(num: string): boolean {
  const n = toIsraeliLocal(num)
  return /^0[2-489]\d{7}$/.test(n)
}

export function normalizeAndClassifyPhone(rawValue: string): PhoneNormalization {
  const raw = String(rawValue || "").trim()
  if (!raw) {
    return { raw: "", normalized: "", phone: "", mobile: "", confidence: 0 }
  }

  let normalized = extractPhoneLike(raw)
  if (/^972\d{8,9}$/.test(normalized)) normalized = `+${normalized}`
  if (!normalized) {
    return {
      raw,
      normalized: "",
      phone: "",
      mobile: "",
      confidence: 0,
    }
  }

  if (looksLikeTimestamp(normalized)) {
    return {
      raw,
      normalized: "",
      phone: "",
      mobile: "",
      confidence: 0,
    }
  }

  if (looksMobileIL(normalized)) {
    return {
      raw,
      normalized,
      phone: "",
      mobile: normalized,
      confidence: 0.9,
    }
  }

  if (looksLandlineIL(normalized)) {
    return {
      raw,
      normalized,
      phone: normalized,
      mobile: "",
      confidence: 0.85,
    }
  }

  if (/^\+?\d{7,15}$/.test(normalized) || /^0\d{8,9}$/.test(normalized)) {
    return {
      raw,
      normalized,
      phone: normalized,
      mobile: "",
      confidence: 0.6,
    }
  }

  return {
    raw,
    normalized: "",
    phone: /\d{7,}/.test(raw) ? raw : "",
    mobile: "",
    confidence: /\d{7,}/.test(raw) ? 0.25 : 0,
  }
}
