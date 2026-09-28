export interface ValuationResponse {
  vehicle: { brand: string; model: string; year: number };
  valuation: { min: number; max: number; average: number; median: number } | null;
  valuationUSD: { min: number; max: number; average: number; median: number } | null;
  statistics: {
    count: number; min: number; max: number; mean: number; median: number;
    trimmedMean: number; stdDev: number; q1: number; q3: number;
    p10: number; p25: number; p50: number; p75: number; p90: number;
    rawMin: number; rawMax: number;
  } | null;
  sample: { found: number; valid: number; used: number; discarded: number; duplicates: number; outliers: number; discardReasons: Record<string, number> };
  comparables: {
    exact: number; nearbyYear: number; variant: number; total: number; effectiveWeight: number;
    byYear: { year: number; count: number; avgWeight: number; medianPriceARS: number }[];
    timeAdjustment: { applied: boolean; slopePerYearARS: number; yearsUsed: number[]; reason: string };
    broadSearchUsed: boolean;
  };
  debug: {
    searchStrategy: { phases: string[]; requestedYear: number; yearsUsed: number[]; yearWindow: number };
    matching: { exact: number; nearbyYear: number; variant: number; invalid: number };
    filtering: { raw: number; invalid: number; duplicated: number; outliers: number; finalComparables: number };
    thresholds: { minComparables: number; minEffectiveWeight: number };
  };
  sources: { name: string; success: boolean; count: number; error?: string; durationMs: number }[];
  exchangeRate: { source: string; strategy: string; arsPerUsd: number; fetchedAt: string; fallback: boolean };
  listings: {
    source: string; title: string; year: number; mileage?: number; price: number;
    currency: string; priceARS?: number; url: string; location?: string; version?: string;
    weight?: number; adjustedPriceARS?: number; matchLevel?: string;
  }[];
  versions: { version: string; count: number; pct: number }[];
  medianMileage: number | null;
  confidence: { level: string; score: number; explanation: string[] };
  queriedAt: string;
  cached: boolean;
  message?: string;
  methodology?: string;
}

export const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n);

export const fmtShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M` : fmtARS(n);
