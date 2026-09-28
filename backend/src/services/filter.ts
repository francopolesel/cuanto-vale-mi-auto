import type { CarListing, SearchCriteria } from '../types.js';
import { scoreComparable } from './comparables.js';
import { normalizeBrand, normalizeText } from './normalizer.js';
import { config } from '../config.js';

export interface FilterOutcome {
  kept: CarListing[];
  discarded: { listing: CarListing; reason: string }[];
}

/**
 * Hard-invalid filter only. Model/year relevance is NOT decided here anymore:
 * listings receive a similarity weight downstream (comparables pipeline).
 * Discarded here: corrupt prices, partial prices (anticipo/cuota),
 * absurd ranges, wrong brand/model family, year outside the window / unknown.
 */
export function filterListings(listings: CarListing[], criteria: SearchCriteria): FilterOutcome {
  const kept: CarListing[] = [];
  const discarded: { listing: CarListing; reason: string }[] = [];

  for (const l of listings) {
    if (!l.price || !Number.isFinite(l.price) || l.price <= 0) {
      discarded.push({ listing: l, reason: 'invalid-price' });
      continue;
    }
    const ars = l.priceARS ?? (l.currency === 'ARS' ? l.price : null);
    if (ars != null) {
      if (ars < 500_000 || ars > 600_000_000) {
        discarded.push({ listing: l, reason: 'price-out-of-range' });
        continue;
      }
    } else if (l.currency === 'USD' && (l.price < 500 || l.price > 400_000)) {
      discarded.push({ listing: l, reason: 'price-out-of-range' });
      continue;
    }
    if (l.priceType === 'DOWN_PAYMENT' || l.priceType === 'INSTALLMENT') {
      discarded.push({ listing: l, reason: 'partial-price' });
      continue;
    }
    const score = scoreComparable(l.title, l.year, l.mileage, criteria, config.yearWindow);
    if (score.modelSimilarity <= 0) {
      const t = ` ${normalizeText(l.title)} `;
      const brandOk = t.includes(` ${normalizeBrand(criteria.brand)} `);
      discarded.push({ listing: l, reason: brandOk ? 'model-mismatch' : 'brand-mismatch' });
      continue;
    }
    if (score.yearSimilarity <= 0) {
      discarded.push({ listing: l, reason: 'year-too-far' });
      continue;
    }
    kept.push({ ...l, weight: score.total, matchLevel: score.level });
  }
  return { kept, discarded };
}
