import { getAuditorBillingConfig } from "./env"

export function getPublicBaseUrl(req: Request): string {
  const cfg = getAuditorBillingConfig()
  const fromEnv = cfg.publicBaseUrl
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim().replace(/\/+$/, "")
  return new URL(req.url).origin
}

export function parseNameValueResponse(rawText: string): Record<string, any> {
  const text = String(rawText || "").trim()
  if (!text) return {}

  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      return JSON.parse(text)
    } catch {
      // fall through
    }
  }

  const params = new URLSearchParams(text.replace(/^\?/, ""))
  const obj: Record<string, any> = {}
  for (const [k, v] of params.entries()) obj[k] = v
  return obj
}

export function requirePublicCallbackUrl(req: Request, baseUrl: string) {
  const cfg = getAuditorBillingConfig()
  const isProd = process.env.NODE_ENV === "production"
  const isLocalBaseUrl = (() => {
    try {
      const u = new URL(baseUrl)
      return u.hostname === "localhost" || u.hostname === "127.0.0.1"
    } catch {
      return false
    }
  })()

  // In production, Cardcom must be able to reach callbacks (IndicatorUrl + redirects).
  // In local development, we allow localhost so you can at least reach the payment page
  // (but you still won't receive server-to-server callbacks without a public tunnel).
  if (isProd && cfg.cardcom.mode === "prod" && isLocalBaseUrl) {
    throw new Error("Invalid PUBLIC_BASE_URL for Cardcom callback (localhost)")
  }
  if (isProd && !cfg.publicBaseUrl) {
    throw new Error("PUBLIC_BASE_URL must be set in production for Cardcom callbacks")
  }
}

export async function openLowProfile(args: {
  amount: number
  coinId: number
  successUrl: string
  errorUrl: string
  indicatorUrl: string
  returnValue: string
  pageLanguage?: string
}) {
  const cfg = getAuditorBillingConfig().cardcom
  const cardcomUrl = "https://secure.cardcom.solutions/Interface/LowProfile.aspx"

  const form = new URLSearchParams({
    Operation: "2", // charge + create token
    TerminalNumber: cfg.terminalNumber,
    UserName: cfg.apiUsername,
    UserPassword: cfg.apiPassword,
    SumToBill: args.amount.toFixed(2),
    CoinId: String(args.coinId),
    APILevel: "10",
    Codepage: "65001",
    SuccessRedirectUrl: args.successUrl,
    ErrorRedirectUrl: args.errorUrl,
    IndicatorUrl: args.indicatorUrl,
    ReturnValue: args.returnValue,
  })

  if (args.pageLanguage && args.pageLanguage.trim()) {
    form.set("Language", args.pageLanguage.trim())
  }

  const r = await fetch(cardcomUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form,
  })
  const raw = await r.text()
  const parsed = parseNameValueResponse(raw)

  const responseCode = String((parsed as any).ResponseCode ?? "")
  const lowProfileCode = String((parsed as any).LowProfileCode ?? "").trim()
  const redirectUrl = String((parsed as any).url ?? "").trim()

  return {
    raw,
    parsed,
    ok: responseCode === "0" && !!lowProfileCode && !!redirectUrl,
    responseCode,
    lowProfileCode,
    redirectUrl,
  }
}

export async function pullLowProfileIndicator(lowProfileCode: string) {
  const cfg = getAuditorBillingConfig().cardcom
  const indicatorUrl = "https://secure.cardcom.solutions/Interface/BillGoldGetLowProfileIndicator.aspx"

  const qs = new URLSearchParams()
  qs.set("terminalnumber", String(cfg.terminalNumber || ""))
  qs.set("username", String(cfg.apiUsername || ""))
  qs.set("lowprofilecode", String(lowProfileCode || ""))
  qs.set("codepage", "65001")

  const r = await fetch(`${indicatorUrl}?${qs.toString()}`, { method: "GET" })
  const raw = await r.text()
  const parsed = parseNameValueResponse(raw)

  const operationResponse = Number((parsed as any).OperationResponse ?? NaN)
  const paid = Number.isFinite(operationResponse) && operationResponse === 0
  const internalDealNumber = String((parsed as any).InternalDealNumber ?? "").trim() || null

  return { raw, parsed, paid, operationResponse, internalDealNumber }
}

function firstNonEmptyString(...vals: Array<any>): string | null {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : ""
    if (s) return s
  }
  return null
}

/**
 * Every name Cardcom returns the card token under.
 *
 * Four, not two. The Low Profile indicator, the token-charge response and the ExtShva
 * block each use their own spelling, and a redaction that knows about only some of
 * them leaks the token under the others while looking complete. This array is the
 * single source: extractTokenFromIndicator reads through it and
 * sanitiseIndicatorForStorage redacts through it.
 */
const CARD_TOKEN_KEYS = [
  "Token",
  "ExtShvaParams.CardToken",
  "ExtShvaParams.CardToken_15",
  "TokenToCharge.Token",
] as const

export function extractTokenFromIndicator(indicator: Record<string, any>): {
  token: string
  tokenExDate: string | null
  brand: string | null
  cardNumStart: string | null
  cardNumEnd: string | null
} | null {
  // Read through the same constant the redactor uses. Whoever adds a fifth Cardcom
  // token alias updates one array and both the reader and the redaction follow.
  const token = firstNonEmptyString(...CARD_TOKEN_KEYS.map((k) => (indicator as any)[k]))
  if (!token) return null

  const tokenExDate = firstNonEmptyString((indicator as any).TokenExDate, (indicator as any).Tokef_30, (indicator as any)["ExtShvaParams.Tokef30"])
  const brand = firstNonEmptyString(
    (indicator as any).Mutag_24,
    (indicator as any)["ExtShvaParams.Mutag24"],
    (indicator as any)["Mutag24"],
    (indicator as any)["Mutag"]
  )
  const cardNumStart = firstNonEmptyString((indicator as any).CardNumStart, (indicator as any)["ExtShvaParams.FirstCardDigits"])
  const cardNumEnd = firstNonEmptyString((indicator as any).CardNumEnd, (indicator as any)["ExtShvaParams.CardNumber5"])

  return { token, tokenExDate, brand, cardNumStart, cardNumEnd }
}

export function normalizeCardcomTokenExDate(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim()
  if (!s) return null
  const digits = s.replace(/\D/g, "")

  // 20280201 -> 0228
  if (digits.length === 8) {
    const year = digits.slice(2, 4)
    const month = digits.slice(4, 6)
    if (Number(month) >= 1 && Number(month) <= 12) return `${month}${year}`
  }

  // 202802 -> 0228
  if (digits.length === 6) {
    const year = digits.slice(2, 4)
    const month = digits.slice(4, 6)
    if (Number(month) >= 1 && Number(month) <= 12) return `${month}${year}`
  }

  // MMYY
  if (digits.length === 4) {
    const month = digits.slice(0, 2)
    if (Number(month) >= 1 && Number(month) <= 12) return digits
  }

  return null
}

export async function chargeToken(args: {
  token: string
  tokenExDate?: string | null
  sumToBill: number
  coinId: number
  uniqAsmachta: string
}) {
  const cfg = getAuditorBillingConfig().cardcom
  const url = "https://secure.cardcom.solutions/interface/ChargeToken.aspx"

  const form = new URLSearchParams({
    TerminalNumber: cfg.terminalNumber,
    UserName: cfg.apiUsername,
    CodePage: "65001",
    "TokenToCharge.Token": args.token,
    "TokenToCharge.SumToBill": args.sumToBill.toFixed(2),
    "TokenToCharge.CoinID": String(args.coinId),
    "TokenToCharge.APILevel": "10",
    "TokenToCharge.UniqAsmachta": args.uniqAsmachta,
    "TokenToCharge.UserPassword": cfg.apiPassword,
  } as Record<string, string>)

  if (args.tokenExDate) {
    form.set("TokenToCharge.TokenExDate", args.tokenExDate)
  }

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form,
  })

  const raw = await r.text()
  const parsed = parseNameValueResponse(raw)
  return { raw, parsed }
}

/**
 * Strip the card token and the cardholder's identity number before anything is stored.
 *
 * ⛔ The token is the instrument that charges the card. It is encrypted in
 * auditor_customer_payment_methods and was, in the same pass, written in clear text
 * inside raw_charge_response on the neighbouring table — so the encryption protected
 * nothing. Cardcom returns it under two names, and both go.
 *
 * CardOwnerID and ExtShvaParams.CardHolderIdentityNumber are an Israeli ID number. On
 * the test terminal it is Cardcom's fixture; in production it is a real customer's
 * ת״ז, and it is not needed for any diagnosis we do.
 *
 * Everything else is kept deliberately: the deal number, the approval code, the last
 * four digits, the card brand, the amount and the response codes are what a
 * reconciliation actually needs, and none of them can move money.
 */
const INDICATOR_SECRET_KEYS: readonly string[] = [
  ...CARD_TOKEN_KEYS,
  // The cardholder's Israeli ID number, under both spellings Cardcom uses.
  "CardOwnerID",
  "ExtShvaParams.CardHolderIdentityNumber",
]

export function sanitiseIndicatorForStorage(parsed: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...parsed }
  for (const k of INDICATOR_SECRET_KEYS) {
    if (k in out) out[k] = "[redacted]"
  }
  return out
}
