/** Single source of truth for the valuation API contract. Backend owns the pipeline, frontend imports these as types only. */

export type Currency = 'ARS' | 'USD';
export type SellerType = 'PARTICULAR' | 'DEALER' | 'UNKNOWN';
export type PriceType = 'CASH' | 'FINANCED' | 'DOWN_PAYMENT' | 'INSTALLMENT' | 'UNKNOWN';
export type ConditionTag = 'USED' | 'NEW_OR_NEAR_NEW' | 'UNKNOWN';
export type DollarStrategy = 'OFICIAL' | 'BLUE' | 'MEP';

export interface SearchCriteria {
  brand: string;
  model: string;
  year: number;
  /** When true, scrapers omit the year from the query to gather nearby-year comparables. */
  broad?: boolean;
  /** Optional filters: soft weights, never hard gates (see comparables.ts). */
  mileage?: number;
  version?: string;
  /** "NEW" = user is looking for a 0 km car: zero-km comparables weigh more. */
  condition?: 'NEW';
}

export interface CarListing {
  source: string;
  sourceId?: string;
  title: string;
  brand: string;
  model: string;
  version?: string;
  /** Optional generation tag (e.g. "MK7"). Rarely present; year proximity is the proxy. */
  generation?: string;
  year: number;
  mileage?: number;
  price: number;
  currency: Currency;
  priceARS?: number;
  originalPriceText?: string;
  priceType: PriceType;
  conditionTag: ConditionTag;
  location?: string;
  sellerType: SellerType;
  url: string;
  scrapedAt: string;
  /** Comparable scoring (filled by the pipeline, also exposed per listing in the response). */
  weight?: number;
  adjustedPriceARS?: number;
  matchLevel?: MatchLevel;
}

export type MatchLevel = 'EXACT' | 'NEARBY_YEAR' | 'VARIANT' | 'INVALID';

export interface ComparableScore {
  modelSimilarity: number;
  yearSimilarity: number;
  versionSimilarity: number;
  mileageSimilarity: number;
  mileageFactor: number;
  total: number;
  level: MatchLevel;
}

export interface ScraperResult {
  source: string;
  success: boolean;
  durationMs: number;
  listings: CarListing[];
  error?: string;
}

export interface CarDataSource {
  name: string;
  search(criteria: SearchCriteria): Promise<CarListing[]>;
}

export interface ExchangeRateInfo {
  source: string;
  strategy: string;
  arsPerUsd: number;
  fetchedAt: string;
  fallback: boolean;
}

export interface ValuationStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  trimmedMean: number;
  stdDev: number;
  q1: number;
  q3: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  rawMin: number;
  rawMax: number;
}

export interface DollarQuote {
  selected: ExchangeRateInfo | null;
  oficial: ExchangeRateInfo | null;
  blue: ExchangeRateInfo | null;
  mep: ExchangeRateInfo | null;
}

export interface ValuationResponse {
  vehicle: SearchCriteria;
  valuation: { min: number; max: number; average: number; median: number } | null;
  valuationUSD: { min: number; max: number; average: number; median: number } | null;
  statistics: ValuationStats | null;
  sample: {
    found: number;
    valid: number;
    used: number;
    discarded: number;
    duplicates: number;
    outliers: number;
    discardReasons: Record<string, number>;
  };
  comparables: {
    exact: number;
    nearbyYear: number;
    variant: number;
    total: number;
    effectiveWeight: number;
    byYear: { year: number; count: number; avgWeight: number; medianPriceARS: number }[];
    timeAdjustment: { applied: boolean; slopePerYearARS: number; yearsUsed: number[]; reason: string };
    mileageAdjustment: { applied: boolean; slopePerKmARS: number; samples: number; reason: string };
    appliedFilters: { mileage: number | null; version: string | null; relaxed: string[] };
    broadSearchUsed: boolean;
  };
  debug: {
    searchStrategy: { phases: string[]; requestedYear: number; yearsUsed: number[]; yearWindow: number };
    matching: { exact: number; nearbyYear: number; variant: number; invalid: number };
    filtering: { raw: number; invalid: number; duplicated: number; outliers: number; finalComparables: number };
    thresholds: { minComparables: number; minEffectiveWeight: number };
  };
  sources: { name: string; success: boolean; count: number; error?: string; durationMs: number }[];
  exchangeRate: ExchangeRateInfo;
  listings: CarListing[];
  versions: { version: string; count: number; pct: number }[];
  medianMileage: number | null;
  confidence: { level: 'ALTA' | 'MEDIA' | 'BAJA' | 'INSUFICIENTE'; score: number; explanation: string[] };
  queriedAt: string;
  cached: boolean;
  message?: string;
  /** Human-readable explanation of how the estimate was built (fallback narrative). */
  methodology?: string;
}
