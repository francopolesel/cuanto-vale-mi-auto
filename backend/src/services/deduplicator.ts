import type { CarListing } from '../types.js';
import { normalizeText } from './normalizer.js';

function keyOf(l: CarListing): string {
  if (l.sourceId) return `${l.source}::${l.sourceId}`;
  return l.url;
}

export function deduplicate(listings: CarListing[]): { unique: CarListing[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: CarListing[] = [];
  let duplicates = 0;

  // Pass 1: exact id/url
  const pass1: CarListing[] = [];
  for (const l of listings) {
    const k = keyOf(l).toLowerCase();
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    pass1.push(l);
  }

  // Pass 2: fuzzy — same normalized title + year + mileage + price within 2%
  const fuzzySeen: { title: string; year: number; mileage?: number; priceARS: number }[] = [];
  for (const l of pass1) {
    const title = normalizeText(l.title);
    const priceARS = l.priceARS ?? l.price;
    const isDup = fuzzySeen.some((s) => {
      if (s.title !== title) return false;
      if (s.year !== l.year) return false;
      if ((s.mileage ?? -1) !== (l.mileage ?? -1)) return false;
      const denom = Math.max(s.priceARS, priceARS, 1);
      return Math.abs(s.priceARS - priceARS) / denom < 0.02;
    });
    if (isDup) {
      duplicates++;
      continue;
    }
    fuzzySeen.push({ title, year: l.year, mileage: l.mileage, priceARS });
    unique.push(l);
  }
  return { unique, duplicates };
}
