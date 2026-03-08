import { PLAN_PRICES_USD } from "@/lib/auditor/pricing"

export type BillingMarket = "il" | "intl"

/**
 * Resolves billing market from success_url or base_path.
 * - intl: English/International flow (USD, en)
 * - il: Israeli flow (ILS, he) — default
 */
export function resolveBillingMarket(successUrl?: string, basePath?: string): BillingMarket {
  if (typeof successUrl === "string" && successUrl.includes("/en/auditor")) return "intl"
  const base = (basePath || "/auditor").replace(/\/+$/, "") || "/auditor"
  if (base.startsWith("/en")) return "intl"
  return "il"
}

export type CardcomMarketConfig = {
  amount: number
  coinId: number
  pageLanguage: string
  currency: string
}

/**
 * Returns Cardcom payload config for the given market and plan.
 * - il: ILS amount from auditor_plans, coinId 1, Hebrew
 * - intl: USD amount from PLAN_PRICES_USD, coinId 2, English
 */
export function getCardcomMarketConfig(
  market: BillingMarket,
  planId: string,
  planIlsAmount: number
): CardcomMarketConfig {
  if (market === "intl") {
    const usdAmount = (PLAN_PRICES_USD as Record<string, number>)[planId]
    const amount = Number.isFinite(usdAmount) && usdAmount > 0 ? usdAmount : planIlsAmount
    return {
      amount,
      coinId: 2, // USD
      pageLanguage: "en",
      currency: "USD",
    }
  }
  return {
    amount: planIlsAmount,
    coinId: 1, // ILS
    pageLanguage: "he",
    currency: "ILS",
  }
}
