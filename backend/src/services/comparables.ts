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
 */
export function getVersionSimilarity(title: string, model: string): number {
  const t = normalizeText(title);
  const tokens = modelTokens(model).slice(1); // beyond the base model token
  if (tokens.length === 0) return 1.0;
  const matched = tokens.filter((tok) => t.includes(tok)).length;
  return 0.7 + 0.3 * (matched / tokens.length);
}

export function scoreComparable(
  title: string,
  listingYear: number,
  hasMileage: boolean,
  criteria: SearchCriteria,
  yearWindow = 3,
): ComparableScore {
  const model = getModelSimilarity(title, criteria.brand, criteria.model);
  const yearSimilarity = getYearSimilarityWeight(criteria.year, listingYear, yearWindow);
  const versionSimilarity = model.score > 0 ? getVersionSimilarity(title, criteria.model) : 0;
  // Missing mileage slightly lowers comparability; never destroys it.
  const mileageFactor = hasMileage ? 1.0 : 0.95;
  const total = model.score * yearSimilarity * versionSimilarity * mileageFactor;

  let level: MatchLevel = 'INVALID';
  if (model.score > 0 && yearSimilarity > 0) {
    if (model.score >= 1 && listingYear === criteria.year) level = 'EXACT';
    else if (listingYear === criteria.year) level = 'VARIANT';
    else if (model.score >= 1) level = 'NEARBY_YEAR';
    else level = 'VARIANT';
  }
  return { modelSimilarity: model.score, yearSimilarity, versionSimilarity, mileageFactor, total, level };
}
