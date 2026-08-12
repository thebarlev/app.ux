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
 * Keep what we named. Drop everything else.
 *
 * ── WHY AN ALLOW-LIST AND NOT A DENY-LIST ───────────────────────────────────
 * The first version of this was a deny-list of two key names. Cardcom returns the card
 * token under FOUR, and the personal fields under six more — so the deny-list shipped
 * leaking the token under two aliases while looking complete. That is the structural
 * argument, and it was demonstrated rather than predicted: you cannot enumerate in
 * advance what a third party will send.
 *
 * With an allow-list the default flips. A field Cardcom adds next year is dropped
 * because nobody named it, not kept because nobody thought of it.
 *
 * ── THE COST, AND WHAT PAYS IT ──────────────────────────────────────────────
 * An allow-list silently throws away things that turn out to matter. So the names of
 * everything dropped are recorded in `dropped_keys` — names only, never values. You can
 * see that Cardcom sent a field, and that we discarded it, without holding whatever was
 * in it. If a real charge shows something worth keeping in that array, it moves into
 * CARDCOM_KEEP_KEYS and the next charge keeps it.
 *
 * ⚠️ HOW THIS LIST WAS BUILT, AND WHAT THAT MEANS
 * From the fields our own code reads plus the categories agreed as safe to keep — NOT
 * from reading the stored JSON, which is not accessible from here. So it is very likely
 * incomplete, and `dropped_keys` is the instrument that will say how. Treat the first
 * few live charges' dropped_keys as a to-do list, not as a clean bill of health.
 *
 * ── WHAT IS DELIBERATELY KEPT, AND WHY ──────────────────────────────────────
 * Deal and terminal identifiers, approval codes, every response code, the card brand
 * and product name, the BIN and last digits, amounts and the instalment structure, the
 * token expiry, the date, lowprofilecode, ReturnValue and CallIndicatorResponse.
 *
 * The two that are judgement calls rather than obvious:
 *   Tokef30 / TokenExDate — the token's expiry. Needed to warn a subscriber BEFORE a
 *     renewal fails, which is the difference between a heads-up and a dunning email.
 *     Useless on its own: it charges nothing without the token, which is gone.
 *   FirstCardDigits — the BIN. PCI-DSS permits the first six with the last four, and a
 *     chargeback enquiry starts from the issuing bank, which is what the BIN names.
 *
 * ── AND A HARD DENY THAT WINS REGARDLESS ────────────────────────────────────
 * CARDCOM_NEVER_KEEP is checked first, so a key cannot be readmitted by being added to
 * the allow-list by mistake. Belt and braces on the one thing that must not leak.
 */

/** Names of every field Cardcom may return that we refuse to store, whatever else says. */
const CARDCOM_NEVER_KEEP: readonly string[] = [
  ...CARD_TOKEN_KEYS,
  // The cardholder's identity number, name, email and phone. None of it is needed for
  // any reconciliation we do; the buyer company already carries its own contact record.
  "CardOwnerID",
  "ExtShvaParams.CardHolderIdentityNumber",
  "CardOwnerName",
  "ExtShvaParams.CardOwnerName",
  "CardOwnerEmail",
  "CardOwnerPhone",
  "ExtShvaParams.CardOwnerPhone",
]

/**
 * The 50 names kept. Anything else is dropped.
 *
 * ⛔ THIS LIST CAME FROM THE DATABASE, NOT FROM READING OUR CODE.
 *
 * The previous version was assembled from the fields our own code happens to read, plus
 * reasoning about categories. Measured against what Cardcom actually stores it kept 24
 * of 50 — it discarded 26 real fields, including the entire ExtShva settlement block
 * that a chargeback enquiry runs on. Nothing leaked and no secret survived, so the
 * security purpose held; the diagnostic value did not.
 *
 * It was dropped_keys that revealed it. That array exists precisely because an
 * allow-list built from guesswork is wrong in a way nothing else would surface, and
 * this is the mechanism doing its job on its first real run. The list below is now
 * derived from the stored responses themselves and is authoritative.
 *
 * ⚠️ WHAT IS STILL NOT COVERED
 *
 * All 16 stored responses came from the Low Profile checkout indicator. The monthly
 * renewal calls a different Cardcom endpoint (chargeToken) and has never run, so
 * whatever names ITS response uses are absent here and will be dropped on the first
 * renewal. That is not a defect to pre-empt by guessing again — read dropped_keys on the
 * first renewal charge and add what is there.
 *
 * ⚠️ NO REGEX PATTERNS ANY MORE
 *
 * The earlier version also kept anything matching /ResponseCode$/ and similar. Those
 * were a hedge against not knowing the real names, and they quietly defeated the point
 * of an allow-list: a field Cardcom invents next year that happens to end in
 * "ResponseCode" would be kept by a rule nobody reviewed. Exact names only now.
 *
 * `DealRespone` is not a typo here — it is Cardcom's own misspelling, and it arrives
 * alongside the correctly spelled `DealResponse`. Both are kept because both are sent.
 */
const CARDCOM_KEEP_KEYS: readonly string[] = [
  // Top level, as stored.
  "CallIndicatorResponse", "CardValidityMonth", "CardValidityYear", "CoinId", "Country",
  "DealRespone", "DealResponse", "Description", "InternalDealNumber", "Is3DS",
  "lowprofilecode", "Mutag", "NumOfPayments", "Operation", "OperationResponse",
  "OperationResponseText", "ProssesEndOK", "ResponseCode", "ReturnValue", "terminalnumber",
  "TokenApprovalNumber", "TokenExDate", "TokenResponse",
  // The ExtShva settlement block — the acquirer's own record of the transaction.
  "ExtShvaParams.AbroadCard119", "ExtShvaParams.ApprovalNumber71", "ExtShvaParams.BinId",
  "ExtShvaParams.CardName", "ExtShvaParams.CardNumber5", "ExtShvaParams.CardTypeCode60",
  "ExtShvaParams.ChargType66", "ExtShvaParams.ConstPayment86", "ExtShvaParams.CouponNumber",
  "ExtShvaParams.CreditType63", "ExtShvaParams.DealDate", "ExtShvaParams.DealType61",
  "ExtShvaParams.FirstCardDigits", "ExtShvaParams.FirstPaymentSum78",
  "ExtShvaParams.HaveRecipient", "ExtShvaParams.InternalDealNumber",
  "ExtShvaParams.JParameter29", "ExtShvaParams.Mutag24", "ExtShvaParams.NumberOfPayments94",
  "ExtShvaParams.SapakMutav", "ExtShvaParams.Status1", "ExtShvaParams.Sulac25",
  "ExtShvaParams.Sum36", "ExtShvaParams.SumStars52", "ExtShvaParams.TerminalNumber",
  "ExtShvaParams.Tokef30", "ExtShvaParams.Uid",
]

const NEVER = new Set(CARDCOM_NEVER_KEEP.map((k) => k.toLowerCase()))
const KEEP = new Set(CARDCOM_KEEP_KEYS.map((k) => k.toLowerCase()))

function isKeepable(key: string): boolean {
  const lower = key.toLowerCase()
  // NEVER is checked first, so a sensitive name cannot be readmitted by also appearing
  // in the keep list by mistake. Both comparisons are exact — never substring — so
  // TokenApprovalNumber and TokenResponse are kept while Token itself is not.
  if (NEVER.has(lower)) return false
  return KEEP.has(lower)
}

export function sanitiseIndicatorForStorage(parsed: Record<string, any>): Record<string, any> {
  if (!parsed || typeof parsed !== "object") return parsed

  const kept: Record<string, any> = {}
  const dropped: string[] = []

  for (const [key, value] of Object.entries(parsed)) {
    // Structural keys of our own making, not Cardcom's payload. `indicator` wraps the
    // real object in the checkout path; `error` is what we write when there is no
    // response at all. Recurse into the former so the allow-list reaches the fields
    // that matter.
    if (key === "indicator" && value && typeof value === "object") {
      kept[key] = sanitiseIndicatorForStorage(value as Record<string, any>)
      continue
    }
    if (key === "error") {
      kept[key] = value
      continue
    }
    // Our own bookkeeping, added by a previous pass. Carried through so a second run is
    // a no-op — without this it drops itself and records "dropped_keys" as dropped.
    if (key === "dropped_keys") {
      kept[key] = value
      continue
    }
    if (isKeepable(key)) kept[key] = value
    else dropped.push(key)
  }

  // Names only. Sorted so a diff between two charges is readable. Omitted entirely when
  // nothing was dropped, so its presence always means something.
  if (dropped.length > 0) kept.dropped_keys = dropped.sort()
  return kept
}
