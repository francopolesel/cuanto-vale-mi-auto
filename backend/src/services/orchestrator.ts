import type { CarDataSource, CarListing, ScraperResult, SearchCriteria, ValuationResponse } from '../types.js';
import { config } from '../config.js';
import { sleep } from '../utils/http.js';
import { buildSources } from '../scrapers/registry.js';
import { filterListings } from './filter.js';
import { deduplicate } from './deduplicator.js';
import { computeStats, median, removeOutliers, weightedMean, weightedMedian, weightedQuantile } from './statistics.js';
import { confidenceLevel } from './confidence.js';
import { convertToARS, getExchangeRate } from './exchangeRate.js';
import { getComparableYearRange, scoreComparable } from './comparables.js';
import { adjustPricesToYear } from './timeAdjust.js';
import { adjustPricesToMileage } from './mileageAdjust.js';
import { normalizeText } from './normalizer.js';
import { cacheGet, cacheKey, cacheSet } from './cache.js';

async function runWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
      await sleep(config.scrapeDelayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

async function searchAll(sources: CarDataSource[], criteria: SearchCriteria, phase: string): Promise<ScraperResult[]> {
  const tasks = sources.map((s) => async (): Promise<ScraperResult> => {
    const t0 = Date.now();
    try {
      console.log(`[${s.name}] ${phase} ${criteria.brand} ${criteria.model} ${criteria.year}${criteria.broad ? ' (broad)' : ''}`);
      const listings = await s.search(criteria);
      console.log(`[${s.name}] Found ${listings.length} listings`);
      return { source: s.name, success: true, durationMs: Date.now() - t0, listings };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[${s.name}] ERROR: ${msg}`);
      return { source: s.name, success: false, durationMs: Date.now() - t0, listings: [], error: msg };
    }
  });
  return runWithLimit(tasks, config.maxConcurrentScrapers);
}

function rescore(listings: CarListing[], criteria: SearchCriteria): CarListing[] {
  return listings.map((l) => {
    const s = scoreComparable(l.title, l.year, l.mileage, criteria, config.yearWindow);
    return { ...l, weight: s.total, matchLevel: s.level };
  });
}

interface PipelineEstimate {
  kept: CarListing[];
  discarded: { listing: CarListing; reason: string }[];
  duplicates: number;
  usedListings: CarListing[];
  stats: ReturnType<typeof computeStats>;
  wMean: number;
  wMedian: number;
  wP10: number;
  wP90: number;
  effectiveWeight: number;
  outliers: number;
  adjPrices: number[];
  timeAdj: ReturnType<typeof adjustPricesToYear>['info'];
  kmAdj: ReturnType<typeof adjustPricesToMileage>['info'];
  enough: boolean;
}

/** Full local pipeline: filter -> dedup -> time-adjust -> mileage-adjust -> outliers -> weighted stats. */
function buildEstimate(scored: CarListing[], criteria: SearchCriteria): PipelineEstimate {
  const { kept, discarded } = filterListings(scored, criteria);
  console.log(`[Filter] ${kept.length} comparable candidates, ${discarded.length} discarded`);

  const { unique, duplicates } = deduplicate(kept);
  console.log(`[Deduplicator] ${duplicates} duplicates removed`);

  const timeAdj = adjustPricesToYear(
    unique.map((l) => ({ year: l.year, priceARS: l.priceARS ?? l.price })),
    criteria.year,
  );
  console.log(`[TimeAdjust] ${timeAdj.info.applied ? `applied slope ${timeAdj.info.slopePerYearARS}` : `skipped: ${timeAdj.info.reason}`}`);

  const kmAdj = adjustPricesToMileage(
    unique.map((l, i) => ({ mileage: l.mileage ?? 0, priceARS: timeAdj.adjusted[i] })),
    criteria.mileage ?? 0,
  );
  console.log(`[MileageAdjust] ${kmAdj.info.applied ? `applied slope ${kmAdj.info.slopePerKmARS}` : `skipped: ${kmAdj.info.reason}`}`);
  const adjusted = unique.map((l, i) => ({ ...l, adjustedPriceARS: kmAdj.adjusted[i] }));

  const adjPrices = adjusted.map((l) => l.adjustedPriceARS ?? 0);
  const { kept: cleanAdj, outliers } = removeOutliers(adjPrices);
  console.log(`[OutlierDetector] ${outliers} outliers removed`);
  const cleanSet = new Map<number, number>();
  for (const p of cleanAdj) cleanSet.set(p, (cleanSet.get(p) ?? 0) + 1);
  const usedListings: CarListing[] = [];
  for (const l of adjusted) {
    const p = l.adjustedPriceARS ?? 0;
    const remaining = cleanSet.get(p) ?? 0;
    if (remaining > 0) {
      usedListings.push(l);
      cleanSet.set(p, remaining - 1);
    }
  }

  const usedPrices = usedListings.map((l) => l.adjustedPriceARS ?? 0);
  const usedWeights = usedListings.map((l) => l.weight ?? 0);
  const effectiveWeight = usedWeights.reduce((a, b) => a + b, 0);
  const stats = computeStats(usedPrices, adjPrices);
  const enough = usedListings.length >= config.minComparables && effectiveWeight >= config.minEffectiveWeight;

  return {
    kept,
    discarded,
    duplicates,
    usedListings,
    stats,
    wMean: Math.round(weightedMean(usedPrices, usedWeights)),
    wMedian: Math.round(weightedMedian(usedPrices, usedWeights)),
    wP10: Math.round(weightedQuantile(usedPrices, usedWeights, 0.1)),
    wP90: Math.round(weightedQuantile(usedPrices, usedWeights, 0.9)),
    effectiveWeight,
    outliers,
    adjPrices,
    timeAdj: timeAdj.info,
    kmAdj: kmAdj.info,
    enough,
  };
}

function fmtKm(km?: number): string {
  if (km == null) return '';
  return `${new Intl.NumberFormat('es-AR').format(km)} km`;
}

export async function runValuation(criteria: SearchCriteria, opts: { useCache?: boolean } = {}): Promise<ValuationResponse> {
  const key = cacheKey(criteria.brand, criteria.model, criteria.year, criteria.mileage, criteria.version);
  if (opts.useCache !== false) {
    const hit = cacheGet(key);
    if (hit) {
      const parsed = JSON.parse(hit) as ValuationResponse;
      return { ...parsed, cached: true };
    }
  }

  const queriedAt = new Date().toISOString();
  const phases: string[] = ['LEVEL 1: exact model + exact year'];
  const sources: CarDataSource[] = buildSources();
  console.log(`[Valuation] Searching ${criteria.brand} ${criteria.model} ${criteria.year} across ${sources.length} sources`);

  const exchangeRate = await getExchangeRate();
  console.log(`[FX] ${exchangeRate.source} ARS/USD=${exchangeRate.arsPerUsd}`);
  const withArs = (list: CarListing[]): CarListing[] =>
    list.map((l) => ({ ...l, priceARS: convertToARS(l.price, l.currency, exchangeRate.arsPerUsd) }));

  // ---- LEVEL 1: exact search + full pipeline ----
  let results = await searchAll(sources, criteria, 'Searching');
  let raw: CarListing[] = results.flatMap((r) => r.listings);
  console.log(`[Normalizer] ${raw.length} raw listings`);
  let est = buildEstimate(rescore(withArs(raw), criteria), criteria);

  // ---- LEVEL 2-3: broad model search when LEVEL 1 evidence is insufficient ----
  // The decision uses the FULL pipeline outcome (comparables + effective weight),
  // never a raw pre-filter count, so the system keeps trying before giving up.
  let broadSearchUsed = false;
  if (!est.enough) {
    phases.push(
      `LEVEL 2-3: broad model search (phase 1 gave ${est.usedListings.length} comparables, weight ${est.effectiveWeight.toFixed(1)})`,
    );
    const broadResults = await searchAll(sources, { ...criteria, broad: true }, 'Broad search');
    results = [...results, ...broadResults.map((r) => ({ ...r, source: `${r.source} (broad)` }))];
    const broadRaw = broadResults.flatMap((r) => r.listings);
    console.log(`[Normalizer] +${broadRaw.length} broad listings`);
    raw = [...raw, ...broadRaw];
    est = buildEstimate(rescore(withArs(raw), criteria), criteria);
    broadSearchUsed = true;
  }
  phases.push('LEVEL 4-5: variant + nearby-year comparables, weighted');

  // ---- LEVEL 6: relax optional filters (never a hard gate) ----
  // If evidence is still thin, neutralize the most restrictive optional
  // filter first (version, then mileage) and keep whichever yields more
  // comparables. The user is told what was relaxed.
  const relaxed: string[] = [];
  let activeCriteria = criteria;
  const tryRelax = (label: 'version' | 'mileage', next: SearchCriteria): void => {
    const attempt = buildEstimate(rescore(withArs(raw), next), next);
    if (attempt.usedListings.length > est.usedListings.length) {
      est = attempt;
      activeCriteria = next;
      relaxed.push(label);
      phases.push(`LEVEL 6: filtro opcional "${label}" relajado (${attempt.usedListings.length} comparables)`);
    }
  };
  if (!est.enough && activeCriteria.version) {
    tryRelax('version', { ...activeCriteria, version: undefined });
  }
  if (!est.enough && activeCriteria.mileage != null) {
    const { mileage: _drop, ...rest } = activeCriteria;
    tryRelax('mileage', rest);
  }

  const { kept, discarded, duplicates, usedListings, stats, effectiveWeight, outliers, adjPrices, timeAdj, kmAdj } = est;

  const discardReasons: Record<string, number> = {};
  for (const d of discarded) discardReasons[d.reason] = (discardReasons[d.reason] ?? 0) + 1;

  const nExact = usedListings.filter((l) => l.matchLevel === 'EXACT').length;
  const nNearby = usedListings.filter((l) => l.matchLevel === 'NEARBY_YEAR').length;
  const nVariant = usedListings.filter((l) => l.matchLevel === 'VARIANT').length;
  const nearbyShare = usedListings.length ? (nNearby + nVariant) / usedListings.length : 0;
  const missingKm = usedListings.filter((l) => l.mileage == null).length;
  const sourcesOk = new Set(usedListings.map((l) => l.source.replace(' (broad)', ''))).size;

  const confidence = confidenceLevel({
    comparables: usedListings.length,
    effectiveWeight,
    exactCount: nExact,
    nearbyShare,
    sourcesOk,
    stats,
    outlierRatio: adjPrices.length ? outliers / adjPrices.length : 0,
    discardRatio: raw.length ? discarded.length / raw.length : 0,
    missingMileageShare: usedListings.length ? missingKm / usedListings.length : 0,
  });

  const valuation = stats && est.enough ? { min: est.wP10, max: est.wP90, average: est.wMean, median: est.wMedian } : null;
  const valuationUSD =
    valuation != null
      ? {
          min: Math.round(valuation.min / exchangeRate.arsPerUsd),
          max: Math.round(valuation.max / exchangeRate.arsPerUsd),
          average: Math.round(valuation.average / exchangeRate.arsPerUsd),
          median: Math.round(valuation.median / exchangeRate.arsPerUsd),
        }
      : null;

  const byYearMap = new Map<number, { count: number; wSum: number; prices: number[] }>();
  for (const l of usedListings) {
    const e = byYearMap.get(l.year) ?? { count: 0, wSum: 0, prices: [] };
    e.count++;
    e.wSum += l.weight ?? 0;
    e.prices.push(l.adjustedPriceARS ?? 0);
    byYearMap.set(l.year, e);
  }
  const byYear = [...byYearMap.entries()]
    .map(([year, e]) => ({
      year,
      count: e.count,
      avgWeight: Math.round((e.wSum / e.count) * 100) / 100,
      medianPriceARS: Math.round(median(e.prices)),
    }))
    .sort((a, b) => Math.abs(criteria.year - a.year) - Math.abs(criteria.year - b.year));

  const versionCounts = new Map<string, number>();
  for (const l of usedListings) {
    const v = normalizeText(l.version ?? 'base').toUpperCase() || 'BASE';
    versionCounts.set(v, (versionCounts.get(v) ?? 0) + 1);
  }
  const versions = [...versionCounts.entries()]
    .map(([version, count]) => ({ version, count, pct: usedListings.length ? Math.round((count / usedListings.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const kms = usedListings.map((l) => l.mileage).filter((x): x is number => x != null && x > 100);
  const medianMileage = kms.length ? Math.round(median(kms)) : null;

  const methodology = valuation
    ? nExact >= config.minExactForFastPath && !broadSearchUsed && relaxed.length === 0
      ? `Estimación basada en ${usedListings.length} comparables del año ${criteria.year} con mediana y promedio ponderados por similitud.`
      : `Se encontraron ${nExact} publicaciones exactas del ${criteria.year}; la búsqueda se amplió a ${getComparableYearRange(criteria.year, config.yearWindow).join(', ')} y variantes del modelo. ` +
        `Estimación sobre ${usedListings.length} comparables ponderados por similitud` +
        (timeAdj.applied ? `, con precios normalizados al ${criteria.year} (${timeAdj.reason})` : ', sin ajuste temporal') +
        (kmAdj.applied ? ` y normalizados a ${fmtKm(criteria.mileage)} (${kmAdj.reason})` : '') +
        (relaxed.length > 0 ? ` Se relajaron los filtros opcionales (${relaxed.join(', ')}) por poca muestra específica.` : '') +
        `.`
    : undefined;

  const yearsUsed = [...new Set(usedListings.map((l) => l.year))].sort();
  const response: ValuationResponse = {
    vehicle: { brand: criteria.brand, model: criteria.model, year: criteria.year },
    valuation,
    valuationUSD,
    statistics: stats,
    sample: {
      found: raw.length,
      valid: kept.length,
      used: usedListings.length,
      discarded: discarded.length,
      duplicates,
      outliers,
      discardReasons,
    },
    comparables: {
      exact: nExact,
      nearbyYear: nNearby,
      variant: nVariant,
      total: usedListings.length,
      effectiveWeight: Math.round(effectiveWeight * 10) / 10,
      byYear,
      timeAdjustment: {
        applied: timeAdj.applied,
        slopePerYearARS: timeAdj.slopePerYearARS,
        yearsUsed: timeAdj.yearsUsed,
        reason: timeAdj.reason,
      },
      mileageAdjustment: {
        applied: kmAdj.applied,
        slopePerKmARS: kmAdj.slopePerKmARS,
        samples: kmAdj.samples,
        reason: kmAdj.reason,
      },
      appliedFilters: {
        mileage: criteria.mileage ?? null,
        version: criteria.version ?? null,
        relaxed,
      },
      broadSearchUsed,
    },
    debug: {
      searchStrategy: { phases, requestedYear: criteria.year, yearsUsed, yearWindow: config.yearWindow },
      matching: {
        exact: kept.filter((l) => l.matchLevel === 'EXACT').length,
        nearbyYear: kept.filter((l) => l.matchLevel === 'NEARBY_YEAR').length,
        variant: kept.filter((l) => l.matchLevel === 'VARIANT').length,
        invalid: discarded.length,
      },
      filtering: { raw: raw.length, invalid: discarded.length, duplicated: duplicates, outliers, finalComparables: usedListings.length },
      thresholds: { minComparables: config.minComparables, minEffectiveWeight: config.minEffectiveWeight },
    },
    sources: results.map((r) => ({ name: r.source, success: r.success, count: r.listings.length, error: r.error, durationMs: r.durationMs })),
    exchangeRate,
    listings: usedListings.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 120),
    versions,
    medianMileage,
    confidence,
    queriedAt,
    cached: false,
    message: valuation
      ? undefined
      : 'No hay suficientes datos para estimar el vehículo ni siquiera con años cercanos y variantes.',
    methodology,
  };

  cacheSet(key, JSON.stringify(response));
  return response;
}
