import "server-only";

type SdmxJson = any;

function isIsoYmd(x: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(x);
}

function parseFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickTimeDimensionValues(structure: any): string[] {
  const candidates: any[] = [];
  const dims = structure?.dimensions;
  if (Array.isArray(dims?.observation)) candidates.push(...dims.observation);
  if (Array.isArray(dims?.dataset)) candidates.push(...dims.dataset);

  // Prefer TIME_PERIOD if present
  const timeDim =
    candidates.find((d) => String(d?.id || "").toUpperCase() === "TIME_PERIOD") ||
    candidates.find((d) => String(d?.id || "").toUpperCase().includes("TIME")) ||
    candidates.find((d) => Array.isArray(d?.values) && d.values.some((v: any) => isIsoYmd(String(v?.id || "")))) ||
    candidates.find((d) => Array.isArray(d?.values) && d.values.length > 0);

  const values = Array.isArray(timeDim?.values) ? timeDim.values : [];
  return values
    .map((v: any) => String(v?.id || v?.name || "").trim())
    .filter((s: string) => s.length > 0);
}

export type BoiFxObservation = {
  rateDate: string; // YYYY-MM-DD
  rate: number; // 1 BASE = rate ILS
};

export type FetchBoiFxRangeInput = {
  baseCurrency: string; // e.g. USD
  startPeriod: string; // YYYY-MM-DD
  endPeriod: string; // YYYY-MM-DD
  timeoutMs?: number;
};

export async function fetchBoiFxObservationsRange(
  input: FetchBoiFxRangeInput
): Promise<BoiFxObservation[]> {
  const base = String(input.baseCurrency || "").toUpperCase().trim();
  const start = String(input.startPeriod || "").trim();
  const end = String(input.endPeriod || "").trim();

  if (!/^[A-Z]{3}$/.test(base)) {
    throw new Error("invalid_base_currency");
  }
  if (!isIsoYmd(start) || !isIsoYmd(end)) {
    throw new Error("invalid_period");
  }

  const timeoutMs = Number.isFinite(input.timeoutMs) ? Number(input.timeoutMs) : 10_000;

  // BOI official FusionEdge SDMX v2 endpoint (supports SDMX-JSON via format=sdmx-json)
  // Runtime evidence (node fetch) shows:
  // - sdmx-json/data/EXR/D.<BASE>.ILS.SP00.A returns 404
  // - EXR/1.0/RER_<BASE>_ILS returns 200 (SDMX-JSON) when format=sdmx-json
  // - adding c[DTA_TYPE]=OF00 causes 404 for this endpoint
  const seriesKey = `RER_${base}_ILS`;
  const url = new URL(
    `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/${seriesKey}`
  );
  url.searchParams.set("format", "sdmx-json");
  url.searchParams.set("startperiod", start);
  url.searchParams.set("endperiod", end);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`boi_http_${res.status}:${text?.slice(0, 200) || ""}`);
    }

    const json = (await res.json()) as SdmxJson;
    // FusionEdge SDMX v2 may wrap SDMX-JSON under { meta, data }.
    const root = (json as any)?.data?.dataSets ? (json as any).data : json;

    const timeValues = pickTimeDimensionValues((root as any)?.structure);
    if (!Array.isArray(timeValues) || timeValues.length === 0) {
      throw new Error("boi_parse_missing_time_dimension");
    }

    const seriesRoot = (root as any)?.dataSets?.[0]?.series;
    if (!seriesRoot || typeof seriesRoot !== "object") {
      throw new Error("boi_parse_missing_series_root");
    }
    const firstSeriesKey = Object.keys(seriesRoot)[0];
    if (!firstSeriesKey) {
      throw new Error("boi_parse_empty_series");
    }
    const observations = seriesRoot[firstSeriesKey]?.observations;
    if (!observations || typeof observations !== "object") {
      throw new Error("boi_parse_missing_observations");
    }

    const out: BoiFxObservation[] = [];
    for (const [idxStr, obsArr] of Object.entries(observations)) {
      const idx = Number(idxStr);
      if (!Number.isFinite(idx) || idx < 0) continue;
      const rate = parseFiniteNumber((obsArr as any)?.[0]);
      if (rate == null) continue;
      const rateDate = String(timeValues[idx] || "").trim();
      if (!isIsoYmd(rateDate)) continue;
      out.push({ rateDate, rate });
    }

    out.sort((a, b) => (a.rateDate < b.rateDate ? -1 : a.rateDate > b.rateDate ? 1 : 0));
    return out;
  } finally {
    clearTimeout(t);
  }
}

