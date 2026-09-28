import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  scrapeDelayMs: Number(process.env.SCRAPE_DELAY_MS ?? 400),
  maxConcurrentScrapers: Number(process.env.MAX_CONCURRENT_SCRAPERS ?? 3),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 15000),
  cacheTtlMinutes: Number(process.env.CACHE_TTL_MINUTES ?? 60),
  maxPagesPerSource: Number(process.env.MAX_PAGES_PER_SOURCE ?? 4),
  maxListingsPerSource: Number(process.env.MAX_LISTINGS_PER_SOURCE ?? 120),
  maxPagesBroad: Number(process.env.MAX_PAGES_BROAD ?? 6),
  yearWindow: Number(process.env.YEAR_WINDOW ?? 3),
  minComparables: Number(process.env.MIN_COMPARABLES ?? 8),
  minEffectiveWeight: Number(process.env.MIN_EFFECTIVE_WEIGHT ?? 5),
  minExactForFastPath: Number(process.env.MIN_EXACT_FOR_FAST_PATH ?? 8),
  dollarStrategy: (process.env.DOLLAR_STRATEGY ?? 'OFICIAL') as 'OFICIAL' | 'BLUE' | 'MEP',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
};
