import type { ComparableScore, MatchLevel, SearchCriteria } from '../types.js';
import { normalizeBrand, normalizeText } from './normalizer.js';

/**
 * Comparable scoring: every listing gets a similarity weight in [0,1]
 * instead of a binary in/out verdict on model and year.
 *
 * total = modelSimilarity * yearSimilarity * versionSimilarity * mileageFactor
 */

const YEAR_WEIGHTS: Record<number, number> = {
  0: 1.0,
  1: 0.9,
  2: 0.75,
  3: 0.55,
  4: 0.35,
};

/** Gradual year similarity. Years beyond the window score 0 (discard). */
export function getYearSimilarityWeight(requestedYear: number, listingYear: number, yearWindow = 3): number {
  if (!listingYear) return 0;
  const d = Math.abs(requestedYear - listingYear);
  if (d > yearWindow) return 0;
  return YEAR_WEIGHTS[d] ?? 0;
}

/** Comparable year range for transparency/fallback reporting. */
export function getComparableYearRange(requestedYear: number, yearWindow = 3): number[] {
  const out: number[] = [];
  for (let y = requestedYear - yearWindow; y <= requestedYear + yearWindow; y++) out.push(y);
  return out;
}

function modelTokens(model: string): string[] {
  return normalizeText(model).split(' ').filter(Boolean);
}

/**
 * Model similarity from the listing title (generic, no per-model rules):
 * - brand must match (alias-aware) or INVALID
 * - model's first token must appear or INVALID
 * - all model tokens present -> 1.0 (EXACT)
 * - first token + at least one more token -> 0.9 (variant, e.g. "Gol Trend" vs "Gol Trendline")
 * - first token only -> 0.8 (same model family, different naming)
 */
export function getModelSimilarity(title: string, brand: string, model: string): { score: number; level: Exclude<MatchLevel, 'NEARBY_YEAR'> } {
  const t = ` ${normalizeText(title)} `;
  const nb = normalizeBrand(brand);
  const brandOk = t.includes(` ${nb} `) || (nb === 'volkswagen' && t.includes(' vw '));
  if (!brandOk) {
    return { score: 0, level: 'INVALID' };
  }
  const tokens = modelTokens(model);
  const first = tokens[0];
  if (!first || first.length < 2 || !t.includes(first)) {
    // avoid single-letter false positives (e.g. model "Nivus" vs ...); require token len>=2
    return { score: 0, level: 'INVALID' };
  }
  if (tokens.length === 1) return { score: 1.0, level: 'EXACT' };
  const matched = tokens.filter((tok) => t.includes(tok)).length;
  if (matched === tokens.length) return { score: 1.0, level: 'EXACT' };
  if (matched >= 2 || (matched === 1 && tokens.length === 2)) return { score: 0.9, level: 'VARIANT' };
  return { score: 0.8, level: 'VARIANT' };
}

/**
 * Version similarity: when the requested model itself carries extra tokens
 * (e.g. user typed "Corolla XEI"), reward titles containing them.
 * With a plain "brand + base model" query every version scores 1.0.
 * An explicit `version` filter (e.g. "2.0", "GTI") works the same way and is
 * combined by taking the minimum (most specific requirement wins).
 */
export function getVersionSimilarity(title: string, model: string, version?: string): number {
  const t = normalizeText(title);
  const scoreTokens = (tokens: string[]): number => {
    if (tokens.length === 0) return 1.0;
    const matched = tokens.filter((tok) => t.includes(tok)).length;
    return 0.7 + 0.3 * (matched / tokens.length);
  };
  const fromModel = scoreTokens(modelTokens(model).slice(1));
  const fromFilter = version ? scoreTokens(modelTokens(version)) : 1.0;
  return Math.min(fromModel, fromFilter);
}

/**
 * Mileage similarity: Gaussian-ish decay on relative km difference.
 * - No user filter: known 1.0 / unknown 0.95 (as before, never destructive).
 * - With user filter: listing without km scores 0.9 (usable, down-weighted);
 *   with km, weight decays with |km - requested| / scale (scale = max(30k, requested*0.5)).
 */
export function getMileageSimilarity(listingMileage: number | undefined, requestedMileage?: number): number {
  if (requestedMileage == null) return listingMileage != null ? 1.0 : 0.95;
  if (listingMileage == null) return 0.9;
  if (requestedMileage <= 0) return 1.0;
  const scale = Math.max(30_000, requestedMileage * 0.5);
  const d = Math.abs(listingMileage - requestedMileage) / scale;
  return Math.max(0.4, Math.exp(-d * d));
}

export function scoreComparable(
  title: string,
  listingYear: number,
  mileage: number | undefined,
  criteria: SearchCriteria,
  yearWindow = 3,
): ComparableScore {
  const model = getModelSimilarity(title, criteria.brand, criteria.model);
  const yearSimilarity = getYearSimilarityWeight(criteria.year, listingYear, yearWindow);
  const versionSimilarity = model.score > 0 ? getVersionSimilarity(title, criteria.model, criteria.version) : 0;
  const mileageSimilarity = model.score > 0 ? getMileageSimilarity(mileage, criteria.mileage) : 0;
  // Missing mileage slightly lowers comparability; never destroys it.
  const mileageFactor = mileage != null ? 1.0 : 0.95;
  const total = model.score * yearSimilarity * versionSimilarity * mileageSimilarity * mileageFactor;

  let level: MatchLevel = 'INVALID';
  if (model.score > 0 && yearSimilarity > 0) {
    if (model.score >= 1 && listingYear === criteria.year) level = 'EXACT';
    else if (listingYear === criteria.year) level = 'VARIANT';
    else if (model.score >= 1) level = 'NEARBY_YEAR';
    else level = 'VARIANT';
  }
  return { modelSimilarity: model.score, yearSimilarity, versionSimilarity, mileageSimilarity, mileageFactor, total, level };
}
