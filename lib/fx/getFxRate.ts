import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBoiFxObservationsRange } from "@/lib/fx/boi";

export type FxRateSource = "boi" | "manual";

export type FxRateResult = {
  rate: number;
  rateDate: string; // YYYY-MM-DD
  source: "boi";
};

function isIsoYmd(x: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(x);
}

function addDaysIsoYmd(isoYmd: string, deltaDays: number): string {
  const [y, m, d] = isoYmd.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function getFxRate(
  baseCurrency: string,
  paymentDate: string
): Promise<FxRateResult> {
  const base = String(baseCurrency || "").toUpperCase().trim();
  const date = String(paymentDate || "").trim();

  if (!/^[A-Z]{3}$/.test(base)) throw new Error("invalid_base_currency");
  if (!isIsoYmd(date)) throw new Error("invalid_payment_date");

  // Fast-path: same currency
  if (base === "ILS") {
    return { rate: 1, rateDate: date, source: "boi" };
  }

  const admin = createAdminClient();

  // 1) DB cache: latest published date <= paymentDate
  {
    const { data, error } = await admin
      .from("fx_rates")
      .select("rate, rate_date, source")
      .eq("base_currency", base)
      .eq("quote_currency", "ILS")
      .lte("rate_date", date)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.rate != null && data?.rate_date) {
      const rate = Number(data.rate);
      const rateDate = String(data.rate_date).slice(0, 10);
      if (Number.isFinite(rate) && isIsoYmd(rateDate)) {
        return { rate, rateDate, source: "boi" };
      }
    }
  }

  // 2) Fetch from BOI (range) + upsert into cache + pick latest <= paymentDate
  const startPeriod = addDaysIsoYmd(date, -30);
  const observations = await fetchBoiFxObservationsRange({
    baseCurrency: base,
    startPeriod,
    endPeriod: date,
  });

  if (!observations.length) {
    throw new Error("boi_no_observations");
  }

  // Upsert all returned observations (best-effort).
  const rows = observations.map((o) => ({
    base_currency: base,
    quote_currency: "ILS",
    rate: o.rate,
    rate_date: o.rateDate,
    source: "boi",
  }));

  await admin
    .from("fx_rates")
    .upsert(rows, { onConflict: "base_currency,quote_currency,rate_date" });

  const eligible = observations.filter((o) => o.rateDate <= date);
  eligible.sort((a, b) => (a.rateDate < b.rateDate ? -1 : a.rateDate > b.rateDate ? 1 : 0));
  const picked = eligible[eligible.length - 1];
  if (!picked) {
    throw new Error("boi_no_rate_before_payment_date");
  }
  return { rate: picked.rate, rateDate: picked.rateDate, source: "boi" };
}

