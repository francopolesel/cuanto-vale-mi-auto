import { describe, expect, it } from 'vitest';
import {
  normalizeText,
  normalizeBrand,
  parsePriceText,
  extractYear,
  extractMileage,
  detectPriceType,
} from './services/normalizer.js';
import {
  mean,
  median,
  quantile,
  trimmedMean,
  removeOutliers,
  computeStats,
  weightedMean,
  weightedMedian,
  weightedQuantile,
} from './services/statistics.js';
import { deduplicate } from './services/deduplicator.js';
import { filterListings } from './services/filter.js';
import { convertToARS } from './services/exchangeRate.js';
import type { CarListing } from './types.js';

const mk = (over: Partial<CarListing> = {}): CarListing => ({
  source: 'Test',
  title: 'Toyota Corolla XEI 2020',
  brand: 'Toyota',
  model: 'Corolla',
  year: 2020,
  price: 27000000,
  currency: 'ARS',
  priceARS: 27000000,
  priceType: 'UNKNOWN',
  conditionTag: 'USED',
  sellerType: 'UNKNOWN',
  url: 'http://x/' + Math.random(),
  scrapedAt: new Date().toISOString(),
  ...over,
});

describe('normalizer', () => {
  it('normalizes text without accents/punct', () => {
    expect(normalizeText('Volkswagen Golf 1.4 TSI')).toBe('volkswagen golf 1 4 tsi');
  });
  it('aliases vw', () => {
    expect(normalizeBrand('VW')).toBe('volkswagen');
  });
  it('parses ARS price', () => {
    expect(parsePriceText('$ 27.800.000').price).toBe(27800000);
  });
  it('parses USD price', () => {
    const r = parsePriceText('U$S 25.000');
    expect(r.price).toBe(25000);
    expect(r.currency).toBe('USD');
  });
  it('extracts year', () => {
    expect(extractYear('Toyota Corolla 2020 XEI')).toBe(2020);
  });
  it('extracts mileage', () => {
    expect(extractMileage('78.000 km')).toBe(78000);
    expect(extractMileage('0 km')).toBe(0);
  });
  it('detects down payment', () => {
    expect(detectPriceType('t', 'Anticipo $10.000.000')).toBe('DOWN_PAYMENT');
    expect(detectPriceType('t', '36 cuotas de $500.000')).toBe('INSTALLMENT');
  });
});

describe('statistics', () => {
  it('mean/median/quantile', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });
  it('trimmedMean removes extremes', () => {
    expect(trimmedMean([1, 2, 3, 4, 100], 0.2)).toBeLessThan(25);
  });
  it('removes IQR outlier', () => {
    const vals = [20, 21, 22, 23, 24, 25, 21, 22, 23, 24, 90];
    const { kept, outliers } = removeOutliers(vals.map((v) => v * 1e6));
    expect(outliers).toBeGreaterThanOrEqual(1);
    expect(kept).not.toContain(90e6);
  });
  it('computeStats percentiles', () => {
    const s = computeStats([1, 2, 3, 4, 5], [1, 2, 3, 4, 100]);
    expect(s?.median).toBe(3);
    expect(s?.rawMax).toBe(100);
  });
});

describe('deduplicator', () => {
  it('removes same url', () => {
    const a = mk({ url: 'http://x/1' });
    const b = mk({ url: 'http://x/1' });
    expect(deduplicate([a, b]).duplicates).toBe(1);
  });
});

describe('filter', () => {
  it('rejects partial prices and far years, keeps nearby years with weight', () => {
    const ok = mk({ mileage: 60000 });
    const bad = mk({ priceType: 'DOWN_PAYMENT' });
    const wrong = mk({ year: 2019, title: 'Toyota Corolla 2019', mileage: 70000 });
    const far = mk({ year: 2010, title: 'Toyota Corolla 2010' });
    const r = filterListings([ok, bad, wrong, far], { brand: 'Toyota', model: 'Corolla', year: 2020 });
    expect(r.kept.length).toBe(2);
    expect(r.kept.find((l) => l.year === 2020)?.weight).toBe(1);
    expect(r.kept.find((l) => l.year === 2019)?.weight).toBeLessThan(1);
    expect(r.discarded.map((d) => d.reason)).toContain('year-too-far');
  });
});

describe('fx', () => {
  it('converts USD', () => {
    expect(convertToARS(25000, 'USD', 1500)).toBe(37500000);
  });
});

describe('comparables', () => {
  it('year weights decay gradually', async () => {
    const { getYearSimilarityWeight } = await import('./services/comparables.js');
    expect(getYearSimilarityWeight(2017, 2017)).toBe(1);
    expect(getYearSimilarityWeight(2017, 2016)).toBe(0.9);
    expect(getYearSimilarityWeight(2017, 2015)).toBe(0.75);
    expect(getYearSimilarityWeight(2017, 2014)).toBe(0.55);
    expect(getYearSimilarityWeight(2017, 2010)).toBe(0);
  });
  it('classifies exact / variant / invalid models', async () => {
    const { getModelSimilarity, scoreComparable } = await import('./services/comparables.js');
    expect(getModelSimilarity('Volkswagen Gol Trend 2017 1.6', 'Volkswagen', 'Gol Trend').level).toBe('EXACT');
    expect(getModelSimilarity('VW Gol Trendline 1.6 2017', 'Volkswagen', 'Gol Trend').score).toBeGreaterThan(0);
    expect(getModelSimilarity('Volkswagen Voyage 2017', 'Volkswagen', 'Gol Trend').level).toBe('INVALID');
    expect(getModelSimilarity('Ford Fiesta 2017', 'Volkswagen', 'Gol Trend').level).toBe('INVALID');
    const s = scoreComparable('Volkswagen Gol Trend 2016', 2016, 80000, {
      brand: 'Volkswagen',
      model: 'Gol Trend',
      year: 2017,
    });
    expect(s.level).toBe('NEARBY_YEAR');
    expect(s.total).toBeCloseTo(0.9, 5);
  });
});

describe('weighted statistics', () => {
  it('weighted median follows the weights', () => {
    expect(weightedMedian([10, 20, 30], [1, 1, 1])).toBe(20);
    expect(weightedMedian([10, 20, 1000], [1, 1, 0.01])).toBe(20);
    expect(weightedMean([10, 20], [3, 1])).toBe(12.5);
    expect(weightedQuantile([1, 2, 3, 4], [1, 1, 1, 1], 0.1)).toBe(1);
  });
});

describe('time adjustment', () => {
  it('estimates trend and normalizes to requested year', async () => {
    const { adjustPricesToYear } = await import('./services/timeAdjust.js');
    const items: { year: number; priceARS: number }[] = [];
    for (let i = 0; i < 6; i++) {
      items.push({ year: 2015, priceARS: 15_000_000 + i * 10_000 });
      items.push({ year: 2016, priceARS: 16_000_000 + i * 10_000 });
      items.push({ year: 2017, priceARS: 17_000_000 + i * 10_000 });
      items.push({ year: 2018, priceARS: 18_000_000 + i * 10_000 });
    }
    const { adjusted, info } = adjustPricesToYear(items, 2017);
    expect(info.applied).toBe(true);
    expect(info.slopePerYearARS).toBeGreaterThan(500_000);
    // 2015 price adjusted up toward 2017 level
    expect(adjusted[0]).toBeGreaterThan(16_500_000);
  });
  it('refuses trend with too few year groups', async () => {
    const { adjustPricesToYear } = await import('./services/timeAdjust.js');
    const { info } = adjustPricesToYear(
      [
        { year: 2017, priceARS: 1 },
        { year: 2017, priceARS: 2 },
      ],
      2017,
    );
    expect(info.applied).toBe(false);
  });
});

describe('optional filters', () => {
  it('version filter rewards matching titles without gating', async () => {
    const { getVersionSimilarity, getMileageSimilarity } = await import('./services/comparables.js');
    expect(getVersionSimilarity('Volkswagen Golf 2.0 GTI', 'Golf', '2.0')).toBe(1);
    expect(getVersionSimilarity('Volkswagen Golf 1.6 Trendline', 'Golf', '2.0')).toBeLessThan(1);
    expect(getVersionSimilarity('Volkswagen Golf 1.6', 'Golf')).toBe(1);
  });
  it('mileage similarity decays with distance, never zeroes', async () => {
    const { getMileageSimilarity } = await import('./services/comparables.js');
    expect(getMileageSimilarity(170000, 170000)).toBe(1);
    expect(getMileageSimilarity(undefined, 170000)).toBe(0.9);
    expect(getMileageSimilarity(undefined, undefined)).toBe(0.95);
    const far = getMileageSimilarity(300000, 50000);
    expect(far).toBeGreaterThanOrEqual(0.4);
    expect(far).toBeLessThan(1);
  });
  it('mileage adjustment normalizes toward requested km when trend is sane', async () => {
    const { adjustPricesToMileage } = await import('./services/mileageAdjust.js');
    const items: { mileage: number; priceARS: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const km = 40000 + i * 10000;
      items.push({ mileage: km, priceARS: Math.round(20_000_000 - 15 * km) });
    }
    const { adjusted, info } = adjustPricesToMileage(items, 170000);
    expect(info.applied).toBe(true);
    expect(info.slopePerKmARS).toBeLessThan(0);
    // low-km car adjusted DOWN toward 170k level
    expect(adjusted[0]).toBeLessThan(items[0].priceARS);
  });
  it('mileage adjustment refuses absurd or increasing trends', async () => {
    const { adjustPricesToMileage } = await import('./services/mileageAdjust.js');
    const few = Array.from({ length: 5 }, (_, i) => ({ mileage: 50000 + i * 10000, priceARS: 10_000_000 }));
    expect(adjustPricesToMileage(few, 170000).info.applied).toBe(false);
    const rising = Array.from({ length: 20 }, (_, i) => ({
      mileage: 40000 + i * 10000,
      priceARS: 10_000_000 + i * 100000,
    }));
    expect(adjustPricesToMileage(rising, 170000).info.applied).toBe(false);
  });
});
